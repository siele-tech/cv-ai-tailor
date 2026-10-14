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
): Promise<RefineResult> {
  if (looksLikeJobAdvert(instruction)) {
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
    user: refineUserPrompt(profile, job, { ...cv, sectionOrder: layout.sections.map((s) => s.key) }, instruction),
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
