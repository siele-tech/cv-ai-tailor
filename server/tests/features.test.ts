import { afterEach, describe, expect, it } from 'vitest';
import { extractText as readPdf, getDocumentProxy } from 'unpdf';
import { HttpError } from '../src/errors.js';
import { parseLayout, type AiRefineOutput } from '../src/schemas.js';
import { detectLayout } from '../src/services/heuristicParser.js';
import { renderCvPdf } from '../src/services/pdf.js';
import { applyRefinement, applySafeguards } from '../src/services/safeguards.js';
import { extractLayout, looksLikeJobAdvert, refineCv, tailorCv } from '../src/services/tailor.js';
import { job, mockAi, profile, sampleContent, testConfig, type MockAi } from './helpers.js';

let ai: MockAi | undefined;
afterEach(async () => {
  await ai?.close();
  ai = undefined;
});

const configFor = (mock: MockAi, extra: NodeJS.ProcessEnv = {}) =>
  testConfig({ AI_API_KEY: 'sk-test-key', AI_BASE_URL: mock.url, AI_MODEL: 'main-model', ...extra });

const TEMPLATE = ['Jane Template', 'jane@example.com', 'EDUCATION', 'Some degree', 'Key Skills:', 'A, B', 'Career History', 'Role', 'References', 'On request'].join('\n');

describe('CV structure', () => {
  it('always yields every section exactly once', () => {
    const layout = parseLayout({ sections: [{ key: 'education', title: '  Academic   Background ' }, { key: 'education' }, { key: 'bogus' }, { key: 'skills', hidden: true }] });
    expect(layout.sections).toHaveLength(8);
    expect(layout.sections[0]).toEqual({ key: 'education', title: 'Academic Background', hidden: false });
    expect(layout.sections[1]).toEqual({ key: 'skills', title: 'Skills', hidden: true });
    expect(parseLayout(undefined).sections.map((s) => s.key)).toEqual(['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'volunteer', 'languages']);
    expect(parseLayout('nonsense').sections).toHaveLength(8);
  });

  it('reads section order and heading wording from a template', () => {
    const { layout, found } = detectLayout(TEMPLATE);
    expect(found).toBe(3);
    expect(layout.sections.slice(0, 3)).toEqual([
      { key: 'education', title: 'EDUCATION', hidden: false },
      { key: 'skills', title: 'Key Skills', hidden: false },
      { key: 'experience', title: 'Career History', hidden: false },
    ]);
  });

  it('uses the AI reading of a template when it finds at least as much', async () => {
    ai = await mockAi([{ content: JSON.stringify({ sections: [{ key: 'experience', title: 'Where I Have Worked' }, { key: 'education', title: 'Schooling' }, { key: 'skills', title: 'Toolbox' }, { key: 'made-up', title: 'x' }] }) }]);
    const result = await extractLayout(configFor(ai), TEMPLATE);
    expect(result.method).toBe('ai');
    expect(result.layout.sections[0]).toMatchObject({ key: 'experience', title: 'Where I Have Worked' });
    expect(ai.requests[0]!.body.messages[1].content).toContain('<cv_text>');
  });

  it('falls back to the rule-based reading when the AI fails', async () => {
    ai = await mockAi([{ status: 500 }, { status: 500 }]);
    const result = await extractLayout(configFor(ai), TEMPLATE);
    expect(result).toMatchObject({ method: 'basic', found: 3 });
  });

  it('the PDF follows the structure: order, heading names and hidden sections', async () => {
    const content = sampleContent();
    content.layout = parseLayout({
      sections: [
        { key: 'education', title: 'Academic Background' },
        { key: 'experience', title: 'Career History' },
        { key: 'skills', title: 'Toolbox' },
        { key: 'projects', hidden: true },
      ],
    });
    const pdf = await getDocumentProxy(new Uint8Array(await renderCvPdf(content)));
    const text = (await readPdf(pdf, { mergePages: true })).text.replace(/\s+/g, ' ');
    const at = (needle: string) => text.indexOf(needle);
    expect(at('ACADEMIC BACKGROUND')).toBeGreaterThan(0);
    expect(at('ACADEMIC BACKGROUND')).toBeLessThan(at('CAREER HISTORY'));
    expect(at('CAREER HISTORY')).toBeLessThan(at('TOOLBOX'));
    expect(at('TOOLBOX')).toBeLessThan(at('PROFESSIONAL SUMMARY'));
    expect(text).not.toContain('Budget Tracker');
    expect(text).not.toContain('PROFESSIONAL EXPERIENCE');
  });

  it('a tailored CV carries the chosen structure', async () => {
    const layout = parseLayout({ sections: [{ key: 'education', title: 'Schooling' }] });
    const result = await tailorCv(testConfig(), profile, job, layout);
    expect(result.content.layout.sections[0]).toMatchObject({ key: 'education', title: 'Schooling' });
  });
});

const exp = profile.experience[0]!;

function revision(overrides: Partial<AiRefineOutput> = {}): AiRefineOutput {
  const current = sampleContent();
  return {
    reply: 'Added your Kafka experience.',
    sectionOrder: [],
    summary: current.summary,
    skills: { technical: [...current.skills.technical, 'Kafka', 'Kubernetes'], soft: current.skills.soft },
    experience: [
      { sourceId: exp.id, bullets: ['Built event streaming with Kafka for loan notifications.', 'Ran workloads on Kubernetes clusters.', 'Design MongoDB schemas and optimise slow queries.'] },
    ],
    projects: [],
    analysis: { score: 78, matchedSkills: ['Node.js', 'Kafka'], missingSkills: ['Kubernetes'], relevantExperience: [], keywordsIncluded: ['Kafka'], suggestions: [], missingInformation: [] },
    ...overrides,
  };
}

const INSTRUCTION = 'I used Kafka at Example Fintech Ltd for event streaming of loan notifications. Please add it.';

describe('refining a CV with an instruction', () => {
  it('accepts facts the user states and still rejects what nobody stated', () => {
    const { content, analysis, newSkills } = applyRefinement(profile, sampleContent(), INSTRUCTION, revision());
    expect(content.skills.technical).toContain('Kafka');
    expect(content.skills.technical).not.toContain('Kubernetes');
    expect(content.experience[0]!.bullets).toEqual(['Built event streaming with Kafka for loan notifications.', 'Design MongoDB schemas and optimise slow queries.']);
    expect(newSkills).toEqual(['Kafka']);
    expect(analysis.score).toBe(78);
    expect(analysis.missingSkills).toContain('Kubernetes');
    expect(analysis.flags.join(' ')).toContain('Kubernetes');
  });

  it('never changes titles, employers, dates, education or roles the model left out', () => {
    const before = sampleContent();
    const { content } = applyRefinement(profile, before, INSTRUCTION, revision());
    expect(content.experience.map(({ bullets: _b, ...facts }) => facts)).toEqual(before.experience.map(({ bullets: _b, ...facts }) => facts));
    expect(content.experience[1]).toEqual(before.experience[1]);
    expect(content.education).toEqual(before.education);
    expect(content.projects).toEqual(before.projects);
    expect(content.contact).toEqual(before.contact);
  });

  it('treats hand-edited CV text as fact', () => {
    const current = sampleContent();
    current.experience[0]!.bullets.push('Managed a team of 12 engineers.');
    const { content } = applyRefinement(profile, current, 'Tighten the wording.', revision({
      skills: current.skills,
      experience: [{ sourceId: exp.id, bullets: ['Led 12 engineers.'] }],
      analysis: { ...revision().analysis, missingSkills: [] },
    }));
    expect(content.experience[0]!.bullets).toEqual(['Led 12 engineers.']);
  });

  it('applies a requested section order', () => {
    const { content } = applyRefinement(profile, sampleContent(), 'Put education first.', revision({ sectionOrder: ['education', 'nonsense', 'experience'] }));
    expect(content.layout.sections.map((s) => s.key).slice(0, 3)).toEqual(['education', 'experience', 'summary']);
    expect(content.layout.sections).toHaveLength(8);
  });

  it('runs through the provider and reports the reply', async () => {
    ai = await mockAi([{ content: JSON.stringify(revision()) }]);
    const result = await refineCv(configFor(ai), profile, job, sampleContent(), INSTRUCTION);
    expect(result.reply).toBe('Added your Kafka experience.');
    expect(result.newSkills).toEqual(['Kafka']);
    const user = ai.requests[0]!.body.messages[1].content as string;
    expect(user).toContain('<instruction>');
    expect(user).toContain('<current_cv>');
    expect(ai.requests[0]!.body.messages[0].content).not.toContain('loan notifications');
  });

  it('is unavailable without an AI key, and says so', async () => {
    const err = await refineCv(testConfig(), profile, job, sampleContent(), INSTRUCTION).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).code).toBe('ai_not_configured');
  });
});

describe('instructions given before tailoring', () => {
  const proposal = {
    summary: 'Developer building financial web applications.',
    skills: { technical: ['Node.js', 'Kafka', 'Kubernetes'], soft: [] },
    experience: [{ sourceId: exp.id, bullets: ['Built REST APIs in Node.js.'] }],
    projects: [],
    analysis: { score: 70, matchedSkills: [], missingSkills: [], relevantExperience: [], keywordsIncluded: [], suggestions: [], missingInformation: [] },
  };

  it('counts what the user states there, and nothing more', () => {
    const { content } = applySafeguards(profile, proposal, { instructions: 'I also used Kafka for event streaming at my current job.' });
    expect(content.skills.technical).toEqual(['Node.js', 'Kafka']);
  });

  it('are sent to the model as the candidate block', async () => {
    ai = await mockAi([{ content: JSON.stringify(proposal) }]);
    await tailorCv(configFor(ai), profile, { ...job, instructions: 'Keep it to one page.' });
    expect(ai.requests[0]!.body.messages[1].content).toContain('<candidate_instructions>\nKeep it to one page.');
  });
});

describe('fallback model', () => {
  const reply = JSON.stringify({
    summary: 'Developer.',
    skills: { technical: ['Node.js'], soft: [] },
    experience: [],
    projects: [],
    analysis: { score: 50, matchedSkills: [], missingSkills: [], relevantExperience: [], keywordsIncluded: [], suggestions: [], missingInformation: [] },
  });

  it('is used when the main model is overloaded', async () => {
    ai = await mockAi([{ status: 503 }, { status: 429 }, { content: reply }]);
    const result = await tailorCv(configFor(ai, { AI_FALLBACK_MODELS: 'backup-one, backup-two' }), profile, job);
    expect(ai.requests.map((r) => r.body.model)).toEqual(['main-model', 'backup-one', 'backup-two']);
    expect(result.aiModel).toBe('backup-two');
  });

  it('is not used for a rejected key, and errors pass through without one', async () => {
    ai = await mockAi([{ status: 401 }]);
    await expect(tailorCv(configFor(ai, { AI_FALLBACK_MODELS: 'backup-model' }), profile, job)).rejects.toMatchObject({ code: 'ai_auth' });
    expect(ai.requests).toHaveLength(1);
    await ai.close();
    ai = await mockAi([{ status: 503 }, { status: 503 }]);
    await expect(tailorCv(configFor(ai), profile, job)).rejects.toMatchObject({ code: 'ai_provider_error' });
  });

  it('without a fallback, a briefly overloaded model is simply tried again', async () => {
    ai = await mockAi([{ status: 503 }, { content: reply }]);
    const result = await tailorCv(configFor(ai), profile, job);
    expect(result.aiModel).toBe('main-model');
    expect(ai.requests).toHaveLength(2);
  });
});

describe('robustness of real model output', () => {
  it('trims over-long analysis and content instead of rejecting the whole CV', () => {
    const long = 'Experience designing, deploying and operating large distributed message brokers in regulated payment environments with strict uptime requirements';
    const { content, analysis } = applySafeguards(profile, {
      summary: 'x'.repeat(4000),
      skills: { technical: ['Node.js'], soft: [] },
      experience: [{ sourceId: exp.id, bullets: ['Built REST APIs in Node.js. ' + 'More detail. '.repeat(60)] }],
      projects: [],
      analysis: { score: 60, matchedSkills: [long], missingSkills: [long], relevantExperience: [long.repeat(5)], keywordsIncluded: [], suggestions: [long.repeat(6)], missingInformation: [long.repeat(6)] },
    });
    expect(analysis.missingSkills[0]!.length).toBeLessThanOrEqual(120);
    expect(analysis.missingSkills[0]!.endsWith('…')).toBe(true);
    expect(content.summary.length).toBeLessThanOrEqual(3000);
    expect(content.experience[0]!.bullets[0]!.length).toBeLessThanOrEqual(600);
    expect(analysis.flags.every((f) => f.length <= 600)).toBe(true);
  });
});

describe('a job advert pasted into the chat box', () => {
  const advert = 'Junior Developer at Example Payments. Responsibilities: build backend services in Node.js and TypeScript, write SQL, support colleagues. Requirements: Node.js, TypeScript, SQL, Git, good communication. ' + 'We value teamwork. '.repeat(10);

  it('is recognised, while ordinary instructions are not', () => {
    expect(looksLikeJobAdvert(advert)).toBe(true);
    expect(looksLikeJobAdvert('Make the summary shorter and put education first.')).toBe(false);
    expect(looksLikeJobAdvert('x '.repeat(500))).toBe(true);
  });

  it('re-tailors the CV from the master CV against it, even in demo mode', async () => {
    const current = sampleContent();
    current.layout = parseLayout({ sections: [{ key: 'education', title: 'Schooling' }] });
    const result = await refineCv(testConfig(), profile, job, current, advert);
    expect(result.job?.description).toBe(advert);
    expect(result.job?.title).toBe(job.title);
    expect(result.reply).toMatch(/job description/);
    expect(result.content.layout.sections[0]!.title).toBe('Schooling');
    expect(result.analysis.matchedSkills).toEqual(expect.arrayContaining(['Node.js', 'TypeScript']));
  });
});
