import { z } from 'zod';
import { aiConfigured, type Config } from '../config.js';
import {
  aiSummarySchema,
  aiTailorSchema,
  type Analysis,
  type CvContent,
  type Job,
  type Profile,
} from '../schemas.js';
import { chatJson } from './ai/client.js';
import {
  EXTRACT_SYSTEM_PROMPT,
  SUMMARY_SYSTEM_PROMPT,
  TAILOR_SYSTEM_PROMPT,
  extractUserPrompt,
  summaryUserPrompt,
  tailorUserPrompt,
} from './ai/prompts.js';
import { demoTailor } from './demo.js';
import { parseCvHeuristically } from './heuristicParser.js';
import { normalizeProfile } from './normalizeProfile.js';
import { applySafeguards, profileFacts } from './safeguards.js';

export type Generator = 'ai' | 'demo';

export interface TailorResult {
  content: CvContent;
  analysis: Analysis;
  generatedBy: Generator;
  aiModel: string;
}

export async function tailorCv(config: Config, profile: Profile, job: Job): Promise<TailorResult> {
  if (!aiConfigured(config)) {
    return { ...demoTailor(profile, job), generatedBy: 'demo', aiModel: '' };
  }
  const proposal = await chatJson(config, {
    system: TAILOR_SYSTEM_PROMPT,
    user: tailorUserPrompt(profile, job),
    schema: aiTailorSchema,
  });
  return { ...applySafeguards(profile, proposal), generatedBy: 'ai', aiModel: config.ai.model };
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
  const { summary } = await chatJson(config, {
    system: SUMMARY_SYSTEM_PROMPT,
    user: summaryUserPrompt(profile, job, currentSummary),
    schema: aiSummarySchema,
  });
  const unverified = profileFacts(profile).unverifiedNumbers(summary);
  return {
    summary,
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
  const raw = await chatJson(config, {
    system: EXTRACT_SYSTEM_PROMPT,
    user: extractUserPrompt(cvText),
    schema: z.record(z.string(), z.unknown()),
  });
  return { profile: normalizeProfile(raw), method: 'ai', warnings: [] };
}
