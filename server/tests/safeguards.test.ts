import { describe, expect, it } from 'vitest';
import type { AiTailorOutput } from '../src/schemas.js';
import { demoTailor } from '../src/services/demo.js';
import { applySafeguards, numberTokens, profileFacts } from '../src/services/safeguards.js';
import { job, profile } from './helpers.js';

const [current, previous] = profile.experience;
const project = profile.projects[0]!;

function proposal(overrides: Partial<AiTailorOutput> = {}): AiTailorOutput {
  return {
    summary: 'Full-stack developer building financial web applications with TypeScript and Node.js.',
    skills: { technical: ['NodeJS', 'TypeScript', 'Kubernetes'], soft: ['Communication'] },
    experience: [
      { sourceId: current!.id, bullets: ['Built REST APIs in Node.js and Express for a savings and loans platform.'] },
    ],
    projects: [{ sourceId: project.id, description: 'Personal finance app that categorises spending.', technologies: ['React', 'Kafka'] }],
    analysis: {
      score: 71.6, requirements: [],
      matchedSkills: ['Node.js', 'TypeScript', 'Kubernetes'],
      missingSkills: ['Kafka'],
      relevantExperience: ['Software Developer at Example Fintech Ltd'],
      keywordsIncluded: ['Node.js', 'Kafka', 'REST'],
      suggestions: ['Mention payment experience in a cover letter.'],
      missingInformation: [],
    },
    ...overrides,
  };
}

describe('profileFacts', () => {
  const facts = profileFacts(profile);

  it('recognises listed skills regardless of spelling variant', () => {
    expect(facts.supports('NodeJS')).toBe(true);
    expect(facts.supports('node.js')).toBe(true);
    expect(facts.canonical('nodejs')).toBe('Node.js');
  });

  it('recognises skills evidenced only in experience text', () => {
    expect(facts.supports('caching')).toBe(true);
  });

  it('rejects skills the profile never mentions', () => {
    expect(facts.supports('Kubernetes')).toBe(false);
    expect(facts.supports('Java')).toBe(false); // must not match inside "JavaScript"
  });

  it('flags only numbers that are absent from the profile', () => {
    expect(facts.unverifiedNumbers('Reduced response time by 35%')).toEqual([]);
    expect(facts.unverifiedNumbers('Reduced response time by 60% for 10k users')).toEqual(['60%', '10k']);
    expect(facts.unverifiedNumbers('Used OAuth2 and S3 with Vue 3')).toEqual([]);
  });

  it('normalises number formats', () => {
    expect(numberTokens('10,000 users and 10k more').map((t) => t.key)).toEqual(['10000', '10000']);
  });
});

describe('applySafeguards', () => {
  it('copies facts from the profile and keeps every role in profile order', () => {
    const { content } = applySafeguards(profile, proposal());
    expect(content.contact).toEqual(profile.contact);
    expect(content.experience.map((e) => e.organization)).toEqual(['Example Fintech Ltd', 'Demo Digital Agency']);
    expect(content.experience[0]).toMatchObject({ title: current!.title, startDate: 'Mar 2022', endDate: 'Present' });
    expect(content.education).toEqual(profile.education);
    expect(content.certifications).toEqual(profile.certifications);
  });

  it('falls back to the master wording for roles the model skipped', () => {
    const { content } = applySafeguards(profile, proposal());
    expect(content.experience[1]!.bullets).toEqual(previous!.responsibilities);
  });

  it('drops unsupported skills and reports them', () => {
    const { content, analysis } = applySafeguards(profile, proposal());
    expect(content.skills.technical).toEqual(['Node.js', 'TypeScript']);
    expect(analysis.missingSkills).toEqual(expect.arrayContaining(['Kafka', 'Kubernetes']));
    expect(analysis.matchedSkills).not.toContain('Kubernetes');
    expect(analysis.flags.join(' ')).toContain('Kubernetes');
  });

  it('removes bullets with invented metrics', () => {
    const { content, analysis } = applySafeguards(
      profile,
      proposal({
        experience: [
          {
            sourceId: current!.id,
            bullets: ['Cut API latency by 80% across 12 services.', 'Reduced average API response time by 35% with caching.'],
          },
        ],
      }),
    );
    expect(content.experience[0]!.bullets).toEqual(['Reduced average API response time by 35% with caching.']);
    expect(analysis.flags.some((f) => f.includes('80%'))).toBe(true);
  });

  it('removes bullets that mention a technology the profile lacks', () => {
    const { content } = applySafeguards(
      profile,
      proposal({
        experience: [
          { sourceId: current!.id, bullets: ['Deployed services to Kubernetes clusters.', 'Designed MongoDB schemas.'] },
        ],
      }),
    );
    expect(content.experience[0]!.bullets).toEqual(['Designed MongoDB schemas.']);
  });

  it('ignores experience and projects that do not exist in the profile', () => {
    const { content } = applySafeguards(
      profile,
      proposal({
        experience: [{ sourceId: 'made-up', bullets: ['CTO at Invented Corp.'] }],
        projects: [{ sourceId: 'nope', description: 'Imaginary', technologies: [] }],
      }),
    );
    expect(content.experience).toHaveLength(profile.experience.length);
    expect(JSON.stringify(content)).not.toContain('Invented Corp');
    expect(content.projects).toEqual([]);
  });

  it('limits project technologies to those in the master project', () => {
    const { content } = applySafeguards(profile, proposal());
    expect(content.projects[0]).toMatchObject({ name: project.name, technologies: ['React'] });
  });

  it('only reports keywords that are really in the CV, and rounds the score', () => {
    const { analysis } = applySafeguards(profile, proposal());
    expect(analysis.keywordsIncluded).toEqual(['Node.js', 'REST']);
    expect(analysis.score).toBe(72);
  });

  it('flags an unverifiable figure in the summary', () => {
    const { analysis } = applySafeguards(profile, proposal({ summary: 'Developer with 12 years of experience.' }));
    expect(analysis.flags.some((f) => f.includes('summary') && f.includes('12'))).toBe(true);
  });
});

describe('demoTailor', () => {
  const { content, analysis } = demoTailor(profile, job);

  it('never adds skills that are missing from the profile', () => {
    expect(analysis.missingSkills).toEqual(expect.arrayContaining(['Kubernetes', 'Kafka']));
    expect(JSON.stringify(content)).not.toMatch(/Kubernetes|Kafka/);
  });

  it('uses only wording from the master profile', () => {
    const master = new Set(profile.experience.flatMap((e) => [...e.responsibilities, ...e.achievements]));
    for (const bullet of content.experience.flatMap((e) => e.bullets)) expect(master.has(bullet)).toBe(true);
    expect(content.summary).toBe(profile.summary);
  });

  it('labels itself as demo output', () => {
    expect(analysis.flags[0]).toMatch(/Demo mode: no AI model was used/);
    expect(analysis.matchedSkills).toEqual(expect.arrayContaining(['Node.js', 'TypeScript', 'MongoDB']));
  });
});
