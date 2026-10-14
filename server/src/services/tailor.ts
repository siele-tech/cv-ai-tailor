import { z } from 'zod';
import { aiConfigured, type Config } from '../config.js';
import { HttpError } from '../errors.js';
import {
  aiLayoutSchema,
  aiRefineSchema,
  aiSummarySchema,
  aiTailorSchema,
  parseLayout,
  type Analysis,
  type CvContent,
  type Job,
  type Layout,
  type Profile,
} from '../schemas.js';
import { chatJson } from './ai/client.js';
import {
  EXTRACT_SYSTEM_PROMPT,
  LAYOUT_SYSTEM_PROMPT,
  REFINE_SYSTEM_PROMPT,
  SUMMARY_SYSTEM_PROMPT,
  TAILOR_SYSTEM_PROMPT,
  extractUserPrompt,
  layoutUserPrompt,
  refineUserPrompt,
  summaryUserPrompt,
  tailorUserPrompt,
} from './ai/prompts.js';
import { demoTailor } from './demo.js';
import { detectLayout, parseCvHeuristically } from './heuristicParser.js';
import { normalizeProfile } from './normalizeProfile.js';
import { renderCvPdfWithInfo } from './pdf.js';
import { applyRefinement, applySafeguards, profileFacts } from './safeguards.js';

export type Generator = 'ai' | 'demo';

export interface TailorResult {
  content: CvContent;
  analysis: Analysis;
  generatedBy: Generator;
  aiModel: string;
}

export async function tailorCv(config: Config, profile: Profile, job: Job, layout?: Layout): Promise<TailorResult> {
  if (!aiConfigured(config)) {
    return { ...demoTailor(profile, job, layout), generatedBy: 'demo', aiModel: '' };
  }
  const { data, model } = await chatJson(config, {
    system: TAILOR_SYSTEM_PROMPT,
    user: tailorUserPrompt(profile, job),
    schema: aiTailorSchema,
  });
  return {
    ...applySafeguards(profile, data, { layout, instructions: job.instructions }),
    generatedBy: 'ai',
    aiModel: model,
  };
}

export interface RefineResult extends TailorResult {
  /** Set when the message was a new job description and the CV was re-tailored to it. */
  job?: Job;
  /** The model's short note to the user about what it did or declined. */
  reply: string;
  /** Skills added on the user's say-so that their master CV does not list yet. */
  newSkills: string[];
}

/**
 * People paste whole job adverts into the chat box. Long text, or medium-length text that reads
 * like an advert, is taken as a new job description rather than an editing instruction.
 */
export function looksLikeJobAdvert(text: string): boolean {
  const advertWords = /\b(requirements?|responsibilities|qualifications|job description|about the role|what you('|’)ll do|we are looking for|how to apply)\b/i;
  return text.length >= 900 || (text.length >= 300 && advertWords.test(text));
}

/** Revise an existing CV according to a free-text instruction from the user. */
export async function refineCv(
  config: Config,
  profile: Profile,
  job: Job,
  current: CvContent,
  instruction: string,
  styleSample?: string,
): Promise<RefineResult> {
  if (!styleSample && looksLikeJobAdvert(instruction)) {
    // Start again from the master CV against the pasted advert, keeping this CV's structure.
    const newJob: Job = { ...job, description: instruction };
    const tailored = await tailorCv(config, profile, newJob, current.layout);
    return {
      ...tailored,
      job: newJob,
      reply:
        'That looks like a job description, so I tailored your CV to it from your master CV. If the job title or company differ, change them in the Edit tab.',
      newSkills: [],
    };
  }
  if (!aiConfigured(config)) {
    throw new HttpError(503, 'Instructions need an AI provider. Add an AI API key on the server to use this.', 'ai_not_configured');
  }
  // The model sees ids and wording, not the layout bookkeeping.
  const { layout, ...cv } = current;
  const { data, model } = await chatJson(config, {
    system: REFINE_SYSTEM_PROMPT,
    user: refineUserPrompt(profile, job, { ...cv, sectionOrder: layout.sections.map((s) => s.key) }, instruction, styleSample),
    schema: aiRefineSchema,
  });
  const refined = applyRefinement(profile, current, instruction, data);
  return {
    ...refined,
    reply: data.reply || 'Done.',
    generatedBy: 'ai',
    aiModel: model,
  };
}

const RESTYLE_INSTRUCTION =
  'Rewrite my CV in the manner of the sample CV in <style_sample>: match its tone, summary length, bullet style and level of detail, and how it presents skills. Keep all of my own facts and do not copy anything factual from the sample.';

export interface RestyleResult extends RefineResult {
  /** How many of the sample's section headings were recognised and applied. */
  sectionsFound: number;
}

/**
 * Put a CV "in the manner" of a sample CV: its section order and heading names, and (with
 * an AI provider) its writing style. The sample is someone else's document, so nothing
 * factual is taken from it; the usual safeguards also remove anything that slips through.
 */
export async function restyleCv(
  config: Config,
  profile: Profile,
  job: Job,
  current: CvContent,
  analysis: Analysis,
  sampleText: string,
): Promise<RestyleResult> {
  const { layout, found } = await extractLayout(config, sampleText);
  const structured: CvContent = found > 0 ? { ...current, layout } : current;
  const structureNote = found > 0 ? `Applied its section order and ${found} heading name${found === 1 ? '' : 's'}.` : 'No section headings were recognised in it, so the structure is unchanged.';

  if (!aiConfigured(config)) {
    return {
      job,
      content: structured,
      analysis,
      generatedBy: 'demo',
      aiModel: '',
      reply: `${structureNote} Copying its writing style needs an AI provider.`,
      newSkills: [],
      sectionsFound: found,
    };
  }
  const refined = await refineCv(config, profile, job, structured, RESTYLE_INSTRUCTION, sampleText.slice(0, 15_000));
  // The model may suggest an order of its own; the sample's order wins.
  const content = found > 0 ? { ...refined.content, layout } : refined.content;
  return { ...refined, content, reply: `${refined.reply} ${structureNote}`.trim(), sectionsFound: found };
}

export interface SummaryResult {
  summary: string;
  generatedBy: Generator;
  warnings: string[];
}

export async function regenerateSummary(
  config: Config,
  profile: Profile,
  job: Job,
  currentSummary: string,
): Promise<SummaryResult> {
  if (!aiConfigured(config)) {
    return {
      summary: profile.summary,
      generatedBy: 'demo',
      warnings: ['Demo mode cannot rewrite text. The summary was reset to the one in your master CV. Add an AI API key on the server to generate tailored summaries.'],
    };
  }
  const { data } = await chatJson(config, {
    system: SUMMARY_SYSTEM_PROMPT,
    user: summaryUserPrompt(profile, job, currentSummary),
    schema: aiSummarySchema,
  });
  const unverified = profileFacts(profile).unverifiedNumbers(data.summary);
  return {
    summary: data.summary,
    generatedBy: 'ai',
    warnings: unverified.length
      ? [`The new summary mentions a figure (${unverified.join(', ')}) that is not in your master CV. Check it before sending.`]
      : [],
  };
}

export interface ExtractResult {
  profile: Profile;
  method: 'ai' | 'basic';
  warnings: string[];
}

export async function extractProfile(config: Config, cvText: string): Promise<ExtractResult> {
  if (!aiConfigured(config)) {
    const { profile, warnings } = parseCvHeuristically(cvText);
    return {
      profile,
      method: 'basic',
      warnings: [
        'No AI key is configured, so a basic rule-based reader was used. It often misses or misplaces details: please check every section.',
        ...warnings,
      ],
    };
  }
  const { data } = await chatJson(config, {
    system: EXTRACT_SYSTEM_PROMPT,
    user: extractUserPrompt(cvText),
    schema: z.record(z.string(), z.unknown()),
  });
  return { profile: normalizeProfile(data), method: 'ai', warnings: [] };
}

export interface LayoutResult {
  layout: Layout;
  /** How many of the document's headings were recognised. */
  found: number;
  method: 'ai' | 'basic';
}

/** Work out the section order and heading names used by a sample CV or template. */
export async function extractLayout(config: Config, documentText: string): Promise<LayoutResult> {
  const basic = detectLayout(documentText);
  if (!aiConfigured(config)) return { ...basic, method: 'basic' };
  try {
    const { data } = await chatJson(config, {
      system: LAYOUT_SYSTEM_PROMPT,
      user: layoutUserPrompt(documentText.slice(0, 20_000)),
      schema: aiLayoutSchema,
    });
    const layout = parseLayout(data);
    const found = data.sections.filter((s, i, all) => layout.sections.some((l) => l.key === s.key) && all.findIndex((o) => o.key === s.key) === i).length;
    // The rule-based reader is a safety net when the model finds less than it does.
    return found >= basic.found ? { layout, found, method: 'ai' } : { ...basic, method: 'basic' };
  } catch {
    return { ...basic, method: 'basic' };
  }
}

const ONE_PAGE_INSTRUCTION =
  'Shorten this CV so it fits on a single A4 page. Keep the summary to at most three sentences. Keep only the three or four most relevant bullet points for the most relevant roles and one or two for the others, and tighten their wording. Keep the most relevant skills only (about twelve). Keep every role, all dates and all facts.';

export interface OnePageResult extends RefineResult {
  pages: number;
}

/**
 * Make a CV fit on one page: first let the AI trim the least relevant detail, then, if it is
 * still too long, switch to the compact design. Reports the page count it ends up with.
 */
export async function fitOnePage(config: Config, profile: Profile, job: Job, current: CvContent, analysis: Analysis): Promise<OnePageResult> {
  const before = await renderCvPdfWithInfo(current);
  if (before.pages <= 1) {
    return { job, content: current, analysis, generatedBy: aiConfigured(config) ? 'ai' : 'demo', aiModel: '', reply: 'It already fits on one page.', newSkills: [], pages: 1 };
  }

  let result: RefineResult = { job, content: current, analysis, generatedBy: 'demo', aiModel: '', reply: '', newSkills: [] };
  if (aiConfigured(config)) result = await refineCv(config, profile, job, current, ONE_PAGE_INSTRUCTION);

  let content = result.content;
  let pages = (await renderCvPdfWithInfo(content)).pages;
  const steps: string[] = [];
  if (result.reply) steps.push(result.reply);
  if (pages > 1 && content.design !== 'compact') {
    content = { ...content, design: 'compact' };
    pages = (await renderCvPdfWithInfo(content)).pages;
    steps.push('Switched to the Compact design to save space.');
  }
  steps.push(pages <= 1 ? 'It now fits on one page.' : `It is now ${pages} pages. To shorten it further, remove older roles, projects or sections in the Edit tab, or hide sections in Structure.`);
  return { ...result, content, reply: steps.join(' '), pages };
}
