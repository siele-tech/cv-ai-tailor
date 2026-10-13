import {
  analysisSchema,
  cvContentSchema,
  parseLayout,
  type AiRefineOutput,
  type AiTailorOutput,
  type Analysis,
  type CvContent,
  type Experience,
  type Layout,
  type Profile,
  type Project,
} from '../schemas.js';

// Server-side factual safeguards. The model's output is treated as a proposal: facts are
// re-attached from the master profile, and anything the profile does not support is removed
// and reported to the user instead of being silently kept.

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
/** Collapses spelling variants: "Node.js", "NodeJS" and "node js" all become "nodejs". */
const compact = (s: string) => norm(s).replace(/[^a-z0-9+#]/g, '');
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) if (key !== 'id') collectStrings(v, out);
  }
  return out;
}

/** True when `phrase` occurs in `haystack` (already lower-case) as a whole term. */
export function containsTerm(haystack: string, phrase: string): boolean {
  const p = norm(phrase);
  if (p.length < 2) return false;
  return new RegExp(`(?<![a-z0-9])${escapeRegex(p)}(?![a-z0-9])`).test(haystack);
}

// A standalone number, optionally with a k/m/x multiplier, a plus sign or a percent sign.
// Digits glued to letters (S3, OAuth2, HTML5) are not numbers for this purpose.
const NUMBER_RE = /(?<![A-Za-z0-9.])(\d[\d,]*(?:\.\d+)?)([kKmM]\b|[xX]\b)?\+?(\s?%)?(?![A-Za-z0-9])/g;

interface NumberToken {
  raw: string;
  key: string;
  /** Single digits with no unit ("3 teams", "Vue 3") are too ambiguous to police. */
  significant: boolean;
}

export function numberTokens(text: string): NumberToken[] {
  const tokens: NumberToken[] = [];
  for (const match of text.matchAll(NUMBER_RE)) {
    const digits = (match[1] ?? '').replace(/,/g, '');
    let value = Number(digits);
    if (!Number.isFinite(value)) continue;
    const suffix = (match[2] ?? '').toLowerCase();
    if (suffix === 'k') value *= 1_000;
    if (suffix === 'm') value *= 1_000_000;
    const key = suffix === 'x' ? `${value}x` : String(value);
    const significant = value >= 10 || !Number.isInteger(value) || suffix !== '' || Boolean(match[3]);
    tokens.push({ raw: match[0].trim(), key, significant });
  }
  return tokens;
}

export interface ProfileFacts {
  /** Is this skill or term backed by the master profile? */
  supports(term: string): boolean;
  /** The candidate's own spelling of a skill, when the profile lists it. */
  canonical(term: string): string;
  /** Significant numbers in `text` that do not appear anywhere in the master profile. */
  unverifiedNumbers(text: string): string[];
}

/**
 * What the candidate can truthfully claim. `extraTexts` and `extraSkills` are things the
 * candidate typed themselves (an edited CV, an instruction), which count alongside the profile.
 */
export function profileFacts(
  profile: Profile,
  extraTexts: string[] = [],
  extraSkills: { technical: string[]; soft: string[] } = { technical: [], soft: [] },
): ProfileFacts {
  const corpus = [...collectStrings(profile), ...extraTexts].join('\n').toLowerCase();
  const numbers = new Set(numberTokens(corpus).map((t) => t.key));
  const listed = new Map<string, string>();
  const techs = profile.projects.flatMap((p) => p.technologies);
  for (const skill of [...profile.skills.technical, ...profile.skills.soft, ...techs, ...extraSkills.technical, ...extraSkills.soft]) {
    const key = compact(skill);
    if (key && !listed.has(key)) listed.set(key, skill);
  }

  return {
    supports: (term) => listed.has(compact(term)) || containsTerm(corpus, term),
    canonical: (term) => listed.get(compact(term)) ?? term.trim(),
    unverifiedNumbers: (text) => [
      ...new Set(
        numberTokens(text)
          .filter((t) => t.significant && !numbers.has(t.key))
          .map((t) => t.raw),
      ),
    ],
  };
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = compact(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The master profile's own wording for a role, used when no generated bullet survives. */
export function verbatimBullets(exp: Experience, limit = 6): string[] {
  return [...exp.achievements, ...exp.responsibilities].slice(0, limit);
}

const roleLabel = (exp: { title: string; organization: string }) => [exp.title, exp.organization].filter(Boolean).join(' at ') || 'a role';

interface MergeOptions {
  /** The CV being produced, before the model's wording is applied. Its facts are kept as they are. */
  base: CvContent;
  facts: ProfileFacts;
  /** Projects the model may choose from (tailoring), or undefined to keep the base's projects (refining). */
  projectPool?: Project[];
  /** Used in messages: where a claim would have to appear to be accepted. */
  source: string;
  /** Text typed by the candidate for this request. Technologies named in it may be attached to a project. */
  userText?: string;
}

/**
 * Apply a model proposal to a CV. Names, titles, employers, dates, education, certifications
 * and contact details are never taken from the model: it contributes only the summary,
 * selection, ordering and wording, and each piece is checked before it is accepted.
 */
function mergeProposal(ai: AiTailorOutput, options: MergeOptions): { content: CvContent; analysis: Analysis } {
  const { base, facts, source } = options;
  const userText = (options.userText ?? '').toLowerCase();
  const flags: string[] = [];

  // --- skills: only what is supported, in the candidate's own spelling ---
  const rejectedSkills: string[] = [];
  const filterSkills = (proposed: string[]) =>
    dedupe(
      proposed.filter((skill) => {
        if (facts.supports(skill)) return true;
        rejectedSkills.push(skill);
        return false;
      }),
    ).map(facts.canonical);

  let technical = filterSkills(ai.skills.technical);
  const soft = filterSkills(ai.skills.soft);
  if (technical.length === 0) technical = [...base.skills.technical];
  for (const skill of dedupe(rejectedSkills)) {
    flags.push(`Left out the skill "${skill}" because it is not in ${source}. If you genuinely have it, tell the AI where you used it or add it to your master CV.`);
  }

  // Terms that must not appear in the CV text: anything the job wants that the candidate lacks.
  const unsupportedTerms = dedupe([...ai.analysis.missingSkills, ...rejectedSkills]).filter(
    (term) => term.length <= 40 && !facts.supports(term),
  );
  const unsupportedIn = (text: string) => {
    const lower = text.toLowerCase();
    return unsupportedTerms.filter((term) => containsTerm(lower, term));
  };

  // --- experience: every role, in the existing order, with its facts untouched ---
  const proposedBullets = new Map<string, string[]>();
  for (const item of ai.experience) {
    if (!proposedBullets.has(item.sourceId)) proposedBullets.set(item.sourceId, item.bullets);
  }

  const experience = base.experience.map((exp) => {
    const kept: string[] = [];
    for (const bullet of proposedBullets.get(exp.id) ?? []) {
      const badNumbers = facts.unverifiedNumbers(bullet);
      const badTerms = unsupportedIn(bullet);
      if (badNumbers.length) {
        flags.push(`Removed a generated bullet under ${roleLabel(exp)} because it used a figure (${badNumbers.join(', ')}) that is not in ${source}.`);
      } else if (badTerms.length) {
        flags.push(`Removed a generated bullet under ${roleLabel(exp)} because it mentioned ${badTerms.join(', ')}, which ${source} does not show.`);
      } else {
        kept.push(bullet);
      }
    }
    if (!kept.length && exp.bullets.length === 0) {
      flags.push(`${roleLabel(exp)} has no responsibilities or achievements in your master CV, so it appears without bullet points.`);
    }
    // When nothing usable was proposed, the existing wording stays.
    return { ...exp, bullets: kept.length ? dedupe(kept) : exp.bullets };
  });

  // --- projects: names, links and technologies stay factual ---
  const rewrite = (current: Project, proposal: AiTailorOutput['projects'][number], original?: Project): Project => {
    const allowed = new Map([...(original?.technologies ?? []), ...current.technologies].map((t) => [compact(t), t]));
    const technologies = dedupe(proposal.technologies)
      .map((t) => allowed.get(compact(t)) ?? (userText && containsTerm(userText, t) ? t : undefined))
      .filter((t): t is string => Boolean(t));
    const trustworthy =
      proposal.description.length > 0 &&
      facts.unverifiedNumbers(proposal.description).length === 0 &&
      unsupportedIn(proposal.description).length === 0;
    return {
      ...current,
      description: trustworthy ? proposal.description : current.description,
      technologies: technologies.length ? technologies : current.technologies,
    };
  };

  let projects: Project[];
  if (options.projectPool) {
    // Tailoring: the model picks and orders projects from the master profile.
    const pool = new Map(options.projectPool.map((p) => [p.id, p]));
    const used = new Set<string>();
    projects = [];
    for (const proposal of ai.projects) {
      const original = pool.get(proposal.sourceId);
      if (!original || used.has(original.id)) continue;
      used.add(original.id);
      projects.push(rewrite(original, proposal, original));
    }
  } else {
    // Refining: the set of projects is the user's to change in the editor; only wording moves.
    const proposals = new Map(ai.projects.map((p) => [p.sourceId, p]));
    projects = base.projects.map((project) => {
      const proposal = proposals.get(project.id);
      return proposal ? rewrite(project, proposal) : project;
    });
  }

  // --- summary: kept, but anything unverifiable is surfaced for the user to review ---
  const summary = ai.summary;
  const summaryNumbers = facts.unverifiedNumbers(summary);
  if (summaryNumbers.length) {
    flags.push(`The summary mentions a figure (${summaryNumbers.join(', ')}) that is not in ${source}. Check it before sending.`);
  }
  const summaryTerms = unsupportedIn(summary);
  if (summaryTerms.length) {
    flags.push(`The summary mentions ${summaryTerms.join(', ')}, which ${source} does not show. Edit the summary or ask the AI to fix it.`);
  }

  const content = cvContentSchema.parse({ ...base, summary, skills: { technical, soft }, experience, projects });

  // --- analysis: keep it consistent with what actually ended up in the CV ---
  const cvText = collectStrings({ ...content, layout: undefined }).join('\n').toLowerCase();
  const rejected = new Set(rejectedSkills.map(compact));
  const analysis = analysisSchema.parse({
    score: Math.round(ai.analysis.score),
    matchedSkills: dedupe(ai.analysis.matchedSkills).filter((s) => !rejected.has(compact(s))),
    missingSkills: dedupe([...ai.analysis.missingSkills, ...rejectedSkills]),
    relevantExperience: ai.analysis.relevantExperience,
    keywordsIncluded: dedupe(ai.analysis.keywordsIncluded).filter((k) => containsTerm(cvText, k)),
    suggestions: ai.analysis.suggestions,
    flags: [...ai.analysis.missingInformation.map((m) => `Missing information: ${m}`), ...flags].slice(0, 60),
  });

  return { content, analysis };
}

/** The master profile laid out as a CV, in the candidate's own words. */
export function profileAsCv(profile: Profile, layout: Layout, bulletLimit = 6): CvContent {
  return cvContentSchema.parse({
    contact: profile.contact,
    summary: profile.summary,
    skills: profile.skills,
    experience: profile.experience.map((exp) => ({
      id: exp.id,
      title: exp.title,
      organization: exp.organization,
      location: exp.location,
      startDate: exp.startDate,
      endDate: exp.endDate,
      bullets: verbatimBullets(exp, bulletLimit),
    })),
    projects: profile.projects,
    education: profile.education,
    certifications: profile.certifications,
    volunteer: profile.volunteer,
    languages: profile.languages,
    layout,
  });
}

interface TailorOptions {
  layout?: Layout;
  /** The candidate's own instructions for this CV. Facts stated there count as theirs. */
  instructions?: string;
}

/** Build the tailored CV from the master profile plus the model's proposal. */
export function applySafeguards(
  profile: Profile,
  ai: AiTailorOutput,
  options: TailorOptions = {},
): { content: CvContent; analysis: Analysis } {
  const instructions = options.instructions?.trim() ?? '';
  return mergeProposal(ai, {
    base: profileAsCv(profile, options.layout ?? parseLayout(undefined)),
    facts: profileFacts(profile, instructions ? [instructions] : []),
    projectPool: profile.projects,
    source: instructions ? 'your master CV or your instructions' : 'your master CV',
    userText: instructions,
  });
}

export interface Refinement {
  content: CvContent;
  analysis: Analysis;
  /** Skills now on the CV that the master profile does not have (the user just told us about them). */
  newSkills: string[];
}

/**
 * Apply a model's revision of an existing CV. What the candidate has typed (in the CV editor
 * or in the instruction itself) counts as fact alongside the master profile: they are the
 * authority on their own experience. Anything else the model adds is still removed.
 */
export function applyRefinement(profile: Profile, current: CvContent, instruction: string, ai: AiRefineOutput): Refinement {
  const currentText = collectStrings({ ...current, layout: undefined });
  const facts = profileFacts(profile, [...currentText, instruction], current.skills);
  const { content, analysis } = mergeProposal(ai, {
    base: current,
    facts,
    source: 'your master CV, this CV or your instruction',
    userText: instruction,
  });

  // An explicit new section order from the model ("move education to the top").
  if (ai.sectionOrder?.length) {
    const byKey = new Map(content.layout.sections.map((s) => [s.key as string, s]));
    const ordered = ai.sectionOrder.map((key) => byKey.get(key)).filter((s): s is Layout['sections'][number] => Boolean(s));
    content.layout = parseLayout({ sections: [...ordered, ...content.layout.sections] });
  }

  const master = profileFacts(profile);
  const newSkills = [...content.skills.technical, ...content.skills.soft].filter((skill) => !master.supports(skill));
  return { content, analysis, newSkills };
}
