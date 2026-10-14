import type { CvContent, Profile } from './types';

// What the AI changed, so the user can see it: relative to the master CV (after tailoring)
// or relative to the previous version of the same CV (after a chat instruction).

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

export interface ChangeSet {
  summaryChanged: boolean;
  /** Bullet texts (normalised) that are new or reworded. */
  changedBullets: Set<string>;
  bulletsTotal: number;
  /** Skills now on the CV that were not in the baseline. */
  addedSkills: string[];
}

export const isChangedBullet = (changes: ChangeSet | null | undefined, bullet: string) =>
  Boolean(changes?.changedBullets.has(norm(bullet)));

function build(baselineSummary: string, baselineBullets: string[], baselineSkills: string[], content: CvContent): ChangeSet {
  const known = new Set(baselineBullets.map(norm));
  const bullets = content.experience.flatMap((e) => e.bullets);
  const knownSkills = new Set(baselineSkills.map(norm));
  return {
    summaryChanged: norm(content.summary) !== norm(baselineSummary) && content.summary.trim().length > 0,
    changedBullets: new Set(bullets.map(norm).filter((b) => !known.has(b))),
    bulletsTotal: bullets.length,
    addedSkills: [...content.skills.technical, ...content.skills.soft].filter((s) => !knownSkills.has(norm(s))),
  };
}

/** How a tailored CV differs from the master CV it was built from. */
export function changesFromMaster(master: Profile, content: CvContent): ChangeSet {
  return build(
    master.summary,
    master.experience.flatMap((e) => [...e.responsibilities, ...e.achievements]),
    [...master.skills.technical, ...master.skills.soft],
    content,
  );
}

/** How a CV differs from its previous state. */
export function changesBetween(before: CvContent, after: CvContent): ChangeSet & { orderChanged: boolean } {
  const order = (c: CvContent) => c.layout.sections.filter((s) => !s.hidden).map((s) => `${s.key}:${s.title}`).join('|');
  return {
    ...build(before.summary, before.experience.flatMap((e) => e.bullets), [...before.skills.technical, ...before.skills.soft], after),
    orderChanged: order(before) !== order(after),
  };
}

/** "Rewrote the summary and 3 bullet points; added Git" */
export function describeChanges(changes: ReturnType<typeof changesBetween>): string {
  const parts: string[] = [];
  if (changes.summaryChanged) parts.push('the summary');
  if (changes.changedBullets.size) parts.push(`${changes.changedBullets.size} bullet point${changes.changedBullets.size === 1 ? '' : 's'}`);
  const done: string[] = [];
  if (parts.length) done.push(`Rewrote ${parts.join(' and ')}`);
  if (changes.addedSkills.length) done.push(`added ${changes.addedSkills.slice(0, 4).join(', ')}`);
  if (changes.orderChanged) done.push('changed the section order');
  return done.length ? `${done.join('; ')}.` : 'No visible changes to the CV text.';
}
