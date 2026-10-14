import { aiConfigured, type Config } from '../config.js';
import { HttpError } from '../errors.js';
import {
  interviewPrepSchema,
  linkedinSchema,
  type Analysis,
  type CvContent,
  type InterviewPrep,
  type Job,
  type Profile,
} from '../schemas.js';
import { z } from 'zod';
import { chatJson } from './ai/client.js';
import {
  COVER_LETTER_PROMPT,
  INTERVIEW_PROMPT,
  LINKEDIN_PROMPT,
  coverLetterUserPrompt,
  interviewUserPrompt,
  linkedinUserPrompt,
} from './ai/documentPrompts.js';
import { containsTerm, profileFacts } from './safeguards.js';

function requireAi(config: Config) {
  if (!aiConfigured(config)) {
    throw new HttpError(503, 'This needs an AI provider. Add an AI API key on the server to use it.', 'ai_not_configured');
  }
}

/** Facts the candidate can claim: the master CV plus the CV they approved for this job. */
function factsFor(profile: Profile, cv: CvContent) {
  const { layout: _layout, design: _design, ...rest } = cv;
  return profileFacts(profile, [JSON.stringify(rest)], cv.skills);
}

/** Things worth a second look in free text: figures and requirements the candidate does not show. */
function reviewNotes(text: string, profile: Profile, cv: CvContent, analysis: Analysis): string[] {
  const facts = factsFor(profile, cv);
  const notes: string[] = [];
  const numbers = facts.unverifiedNumbers(text);
  if (numbers.length) notes.push(`It mentions ${numbers.join(', ')}, which is not in your CV. Check it is true before sending.`);
  const lower = text.toLowerCase();
  const unsupported = analysis.missingSkills.filter((skill) => skill.length <= 40 && !facts.supports(skill) && containsTerm(lower, skill));
  if (unsupported.length) notes.push(`It mentions ${unsupported.join(', ')}, which your CV does not show. Make sure it is not claimed as experience.`);
  return notes;
}

export interface LetterResult {
  letter: string;
  warnings: string[];
  aiModel: string;
}

export async function writeCoverLetter(config: Config, profile: Profile, job: Job, cv: CvContent, analysis: Analysis, tone: string): Promise<LetterResult> {
  requireAi(config);
  const { data, model } = await chatJson(config, {
    system: COVER_LETTER_PROMPT,
    user: coverLetterUserPrompt(profile, job, cv, tone),
    schema: z.object({ letter: z.string().trim().min(100).max(8000) }),
  });
  return { letter: data.letter, warnings: reviewNotes(data.letter, profile, cv, analysis), aiModel: model };
}

export interface InterviewResult {
  prep: InterviewPrep;
  warnings: string[];
  aiModel: string;
}

export async function prepareInterview(config: Config, profile: Profile, job: Job, cv: CvContent, analysis: Analysis): Promise<InterviewResult> {
  requireAi(config);
  const gaps = (analysis.requirements ?? []).filter((r) => r.status !== 'met').map((r) => r.requirement);
  const { data, model } = await chatJson(config, {
    system: INTERVIEW_PROMPT,
    user: interviewUserPrompt(profile, job, cv, gaps.length ? gaps : analysis.missingSkills),
    schema: z.object({
      questions: z.array(z.object({ question: z.string(), category: z.string().default('experience'), why: z.string().default(''), answer: z.string().default('') })).min(1),
      gaps: z.array(z.object({ gap: z.string(), advice: z.string() })).default([]),
      questionsToAsk: z.array(z.string()).default([]),
    }),
  });
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const prep = interviewPrepSchema.parse({
    questions: data.questions.slice(0, 20).map((q) => ({ question: clip(q.question, 400), category: clip(q.category, 40), why: clip(q.why, 400), answer: clip(q.answer, 2000) })),
    gaps: data.gaps.slice(0, 15).map((g) => ({ gap: clip(g.gap, 200), advice: clip(g.advice, 1000) })),
    questionsToAsk: data.questionsToAsk.slice(0, 10).map((q) => clip(q, 300)),
  });
  const answers = prep.questions.map((q) => q.answer).join('\n');
  return { prep, warnings: reviewNotes(answers, profile, cv, analysis), aiModel: model };
}

export async function writeLinkedin(config: Config, profile: Profile, target: string) {
  requireAi(config);
  const { data, model } = await chatJson(config, {
    system: LINKEDIN_PROMPT,
    user: linkedinUserPrompt(profile, target),
    schema: z.object({ headline: z.string().trim().min(1), about: z.string().trim().min(1), skills: z.array(z.string()).default([]) }),
  });
  const facts = profileFacts(profile);
  const linkedin = linkedinSchema.parse({
    headline: data.headline.slice(0, 220),
    about: data.about.slice(0, 2600),
    // Only skills the profile actually has, in the candidate's own spelling.
    skills: [...new Set(data.skills.filter((s) => facts.supports(s)).map(facts.canonical))].slice(0, 15),
  });
  const numbers = facts.unverifiedNumbers(`${linkedin.headline}\n${linkedin.about}`);
  return {
    linkedin,
    warnings: numbers.length ? [`It mentions ${numbers.join(', ')}, which is not in your master CV. Check it before posting.`] : [],
    aiModel: model,
  };
}
