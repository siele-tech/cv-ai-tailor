import {
  analysisSchema,
  cvContentSchema,
  type AiTailorOutput,
  type Analysis,
  type CvContent,
  type Experience,
  type Profile,
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

export function profileFacts(profile: Profile): ProfileFacts {
  const corpus = collectStrings(profile).join('\n').toLowerCase();
  const numbers = new Set(numberTokens(corpus).map((t) => t.key));
  const listed = new Map<string, string>();
  const techs = profile.projects.flatMap((p) => p.technologies);
  for (const skill of [...profile.skills.technical, ...profile.skills.soft, ...techs]) {
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

const roleLabel = (exp: Experience) => [exp.title, exp.organization].filter(Boolean).join(' at ') || 'a role';

/**
 * Build the tailored CV from the master profile plus the model's proposal.
 * Names, titles, employers, dates, education, certifications and contact details always come
 * from the profile. The model contributes only the summary, selection, ordering and wording.
 */
export function applySafeguards(profile: Profile, ai: AiTailorOutput): { content: CvContent; analysis: Analysis } {
  const facts = profileFacts(profile);
  const flags: string[] = [];

  // --- skills: only what the profile supports, in the candidate's own spelling ---
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
  if (technical.length === 0) technical = [...profile.skills.technical];
  for (const skill of dedupe(rejectedSkills)) {
    flags.push(`Left out the skill "${skill}" because it is not in your master CV. If you genuinely have it, add it to your master profile and tailor again.`);
  }

  // Terms that must not appear in the CV text: anything the job wants that the profile lacks.
  const unsupportedTerms = dedupe([...ai.analysis.missingSkills, ...rejectedSkills]).filter(
    (term) => term.length <= 40 && !facts.supports(term),
  );
  const unsupportedIn = (text: string) => {
    const lower = text.toLowerCase();
    return unsupportedTerms.filter((term) => containsTerm(lower, term));
  };

  // --- experience: every role, in the profile's order, with facts copied from the profile ---
  const proposedBullets = new Map<string, string[]>();
  for (const item of ai.experience) {
    if (!proposedBullets.has(item.sourceId)) proposedBullets.set(item.sourceId, item.bullets);
  }

  const experience = profile.experience.map((exp) => {
    const proposed = proposedBullets.get(exp.id) ?? [];
    const kept: string[] = [];
    for (const bullet of proposed) {
      const badNumbers = facts.unverifiedNumbers(bullet);
      const badTerms = unsupportedIn(bullet);
      if (badNumbers.length) {
        flags.push(`Removed a generated bullet under ${roleLabel(exp)} because it used a figure (${badNumbers.join(', ')}) that is not in your master CV.`);
      } else if (badTerms.length) {
        flags.push(`Removed a generated bullet under ${roleLabel(exp)} because it mentioned ${badTerms.join(', ')}, which your master CV does not show.`);
      } else {
        kept.push(bullet);
      }
    }
    const bullets = kept.length ? dedupe(kept) : verbatimBullets(exp);
    if (!kept.length && bullets.length === 0) {
      flags.push(`${roleLabel(exp)} has no responsibilities or achievements in your master CV, so it appears without bullet points.`);
    }
    return {
      id: exp.id,
      title: exp.title,
      organization: exp.organization,
      location: exp.location,
      startDate: exp.startDate,
      endDate: exp.endDate,
      bullets,
    };
  });

  // --- projects: the model selects and rewords; names, links and technologies stay factual ---
  const projectById = new Map(profile.projects.map((p) => [p.id, p]));
  const usedProjects = new Set<string>();
  const projects: CvContent['projects'] = [];
  for (const item of ai.projects) {
    const source = projectById.get(item.sourceId);
    if (!source || usedProjects.has(source.id)) continue;
    usedProjects.add(source.id);
    const allowed = new Map(source.technologies.map((t) => [compact(t), t]));
    const technologies = dedupe(item.technologies)
      .map((t) => allowed.get(compact(t)))
      .filter((t): t is string => Boolean(t));
    const trustworthy =
      item.description.length > 0 &&
      facts.unverifiedNumbers(item.description).length === 0 &&
      unsupportedIn(item.description).length === 0;
    projects.push({
      id: source.id,
      name: source.name,
      description: trustworthy ? item.description : source.description,
      technologies: technologies.length ? technologies : source.technologies,
      link: source.link,
    });
  }

  // --- summary: kept, but anything unverifiable is surfaced for the user to review ---
  const summary = ai.summary;
  const summaryNumbers = facts.unverifiedNumbers(summary);
  if (summaryNumbers.length) {
    flags.push(`The summary mentions a figure (${summaryNumbers.join(', ')}) that is not in your master CV. Check it before sending.`);
  }
  const summaryTerms = unsupportedIn(summary);
  if (summaryTerms.length) {
    flags.push(`The summary mentions ${summaryTerms.join(', ')}, which your master CV does not show. Edit the summary or regenerate it.`);
  }

  const content = cvContentSchema.parse({
    contact: profile.contact,
    summary,
    skills: { technical, soft },
    experience,
    projects,
    education: profile.education,
    certifications: profile.certifications,
    volunteer: profile.volunteer,
    languages: profile.languages,
  });

  // --- analysis: keep it consistent with what actually ended up in the CV ---
  const cvText = collectStrings(content).join('\n').toLowerCase();
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
