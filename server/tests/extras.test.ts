import JSZip from 'jszip';
import { MongoMemoryServer } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import request from 'supertest';
import { extractText as readPdf, getDocumentProxy } from 'unpdf';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { connectDb } from '../src/db.js';
import { DESIGNS } from '../src/schemas.js';
import { renderCvPdfWithInfo } from '../src/services/pdf.js';
import { TEST_PASSWORD, job, mockAi, profile, sampleContent, testConfig, type MockAi } from './helpers.js';

let mongo: MongoMemoryServer;
let ai: MockAi;
let app: ReturnType<typeof createApp>;
let demoApp: ReturnType<typeof createApp>;
let token = '';
const auth = () => ({ Authorization: `Bearer ${token}` });

/** supertest helper: collect a binary response body. */
const binary = (req: request.Test) =>
  req.buffer(true).parse((r, cb) => {
    const chunks: Buffer[] = [];
    r.on('data', (c: Buffer) => chunks.push(c));
    r.on('end', () => cb(null, Buffer.concat(chunks)));
  });

async function pdfText(buffer: Buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text, totalPages } = await readPdf(pdf, { mergePages: true });
  return { text: text.replace(/\s+/g, ' '), totalPages };
}

async function docxText(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml')!.async('string');
  return xml.replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '');
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDb(testConfig({ MONGODB_URI: mongo.getUri('cv-tailor-extras') }));
  ai = await mockAi([]);
  app = createApp(testConfig({ AI_API_KEY: 'sk-test', AI_BASE_URL: ai.url }));
  demoApp = createApp(testConfig());
  token = (await request(app).post('/api/auth/login').send({ password: TEST_PASSWORD })).body.token;
  await request(app).put('/api/profile').set(auth()).send(profile);
});

afterAll(async () => {
  await ai.close();
  await mongoose.disconnect();
  await mongo.stop();
});

/** Queue the next reply of the mock AI. */
async function nextAiReply(content: unknown) {
  await ai.close();
  ai = await mockAi([{ content: JSON.stringify(content) }]);
  app = createApp(testConfig({ AI_API_KEY: 'sk-test', AI_BASE_URL: ai.url }));
}

describe('PDF designs and page count', () => {
  it.each(DESIGNS)('renders the %s design with all the content', async (design) => {
    const { buffer, pages } = await renderCvPdfWithInfo({ ...sampleContent(), design });
    const { text } = await pdfText(buffer);
    expect(pages).toBe(1);
    expect(text).toContain('Sample Candidate');
    expect(text).toContain('PROFESSIONAL EXPERIENCE');
    expect(text).toContain('Reduced average API response time by 35%');
  });

  it('compact fits more on a page than professional', async () => {
    const long = sampleContent();
    long.experience = Array.from({ length: 4 }, (_, i) => ({ ...long.experience[0]!, id: `e${i}`, organization: `Employer ${i}` }));
    const normal = await renderCvPdfWithInfo({ ...long, design: 'professional' });
    const compact = await renderCvPdfWithInfo({ ...long, design: 'compact' });
    expect(compact.pages).toBeLessThan(normal.pages);
  });

  it('reports the page count and ignores unknown designs', async () => {
    const res = await request(app).post('/api/pdf/info').set(auth()).send({ content: { ...sampleContent(), design: 'neon' } });
    expect(res.body).toEqual({ pages: 1 });
  });
});

describe('Word downloads', () => {
  it('builds a .docx CV with the content in the chosen order', async () => {
    const content = sampleContent();
    content.layout = { sections: [{ key: 'education', title: 'Schooling', hidden: false }, ...content.layout.sections.filter((s) => s.key !== 'education')] };
    const res = await binary(request(app).post('/api/docx').set(auth()).send({ content, jobTitle: 'Backend Engineer', company: 'Acme Bank' }));
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('Acme_Bank_Backend_Engineer_Tailored_CV.docx');
    const text = await docxText(res.body as Buffer);
    expect(text).toContain('Sample Candidate');
    expect(text).toContain('Example Fintech Ltd');
    expect(text.indexOf('SCHOOLING')).toBeLessThan(text.indexOf('PROFESSIONAL EXPERIENCE'));
  });

  it('builds the cover letter as PDF and .docx', async () => {
    const letter = 'Dear Hiring Manager,\n\nI am applying for the Backend Engineer role.\n\nYours sincerely,\nSample Candidate';
    const body = { letter, contact: profile.contact, jobTitle: 'Backend Engineer', company: 'Acme Bank' };
    const pdf = await binary(request(app).post('/api/letter/pdf').set(auth()).send(body));
    expect(pdf.headers['content-disposition']).toContain('Acme_Bank_Backend_Engineer_Cover_Letter.pdf');
    expect((await pdfText(pdf.body as Buffer)).text).toContain('I am applying for the Backend Engineer role.');
    const docx = await binary(request(app).post('/api/letter/docx').set(auth()).send(body));
    expect(await docxText(docx.body as Buffer)).toContain('Yours sincerely');
    expect((await request(app).post('/api/letter/pdf').set(auth()).send({ ...body, letter: '' })).status).toBe(400);
  });
});

describe('AI documents', () => {
  const body = () => ({ job, content: sampleContent(), analysis: { score: 70, missingSkills: ['Kubernetes'] } });

  it('writes a cover letter and flags unsupported claims', async () => {
    await nextAiReply({ letter: 'Dear Hiring Manager,\n\nI build Node.js APIs and have run Kubernetes clusters for 12 banks. '.padEnd(160, '.') + '\n\nYours sincerely,\nSample Candidate' });
    const res = await request(app).post('/api/documents/cover-letter').set(auth()).send({ ...body(), tone: 'warm' });
    expect(res.status).toBe(200);
    expect(res.body.letter).toContain('Dear Hiring Manager');
    expect(res.body.warnings.join(' ')).toMatch(/12/);
    expect(res.body.warnings.join(' ')).toMatch(/Kubernetes/);
    const sent = ai.requests[0]!.body.messages[1].content as string;
    expect(sent).toContain('<tailored_cv>');
    expect(sent).toContain('<tone>\nwarm');
  });

  it('prepares interview questions with honest gap advice', async () => {
    await nextAiReply({
      questions: [{ question: 'Tell me about your API work.', category: 'experience', why: 'Core of the role.', answer: 'At Example Fintech Ltd I build REST APIs in Node.js.' }],
      gaps: [{ gap: 'Kubernetes', advice: 'Say you have not used it yet and describe how you would learn it.' }],
      questionsToAsk: ['What does success look like in the first six months?'],
    });
    const res = await request(app).post('/api/documents/interview').set(auth()).send(body());
    expect(res.status).toBe(200);
    expect(res.body.prep.questions[0].question).toContain('API');
    expect(res.body.prep.gaps[0].gap).toBe('Kubernetes');
    expect(res.body.prep.questionsToAsk).toHaveLength(1);
  });

  it('writes a LinkedIn profile using only real skills', async () => {
    await nextAiReply({ headline: 'Full-Stack Developer | Node.js | React', about: 'I build web apps for financial services.', skills: ['Node.js', 'react', 'Kubernetes'] });
    const res = await request(app).post('/api/documents/linkedin').set(auth()).send({ target: 'Backend roles' });
    expect(res.status).toBe(200);
    expect(res.body.linkedin.skills).toEqual(['Node.js', 'React']);
  });

  it('these need an AI provider', async () => {
    const demoToken = (await request(demoApp).post('/api/auth/login').send({ password: TEST_PASSWORD })).body.token;
    const res = await request(demoApp).post('/api/documents/cover-letter').set({ Authorization: `Bearer ${demoToken}` }).send(body());
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('ai_not_configured');
  });
});

describe('one-page mode', () => {
  it('leaves a one-page CV alone', async () => {
    const res = await request(app).post('/api/documents/one-page').set(auth()).send({ job, content: sampleContent() });
    expect(res.body.pages).toBe(1);
    expect(res.body.reply).toMatch(/already fits/);
  });

  it('falls back to the compact design when trimming is not enough (no AI)', async () => {
    const demoToken = (await request(demoApp).post('/api/auth/login').send({ password: TEST_PASSWORD })).body.token;
    const long = sampleContent();
    long.experience = Array.from({ length: 4 }, (_, i) => ({ ...long.experience[0]!, id: `e${i}`, organization: `Employer ${i}` }));
    const before = await renderCvPdfWithInfo(long);
    expect(before.pages).toBeGreaterThan(1);
    const res = await request(demoApp).post('/api/documents/one-page').set({ Authorization: `Bearer ${demoToken}` }).send({ job, content: long });
    expect(res.status).toBe(200);
    expect(res.body.content.design).toBe('compact');
    expect(res.body.reply).toMatch(/Compact/);
  });
});

describe('application tracker and share links', () => {
  let id = '';
  beforeEach(async () => {
    const created = await request(app).post('/api/versions').set(auth()).send({ job, content: sampleContent(), generatedBy: 'demo', coverLetter: 'Dear Hiring Manager, …' });
    id = created.body.version.id;
  });

  it('tracks the status of each application', async () => {
    const res = await request(app).patch(`/api/versions/${id}/application`).set(auth()).send({ status: 'interview', appliedAt: '2026-10-01', notes: 'Call on Monday' });
    expect(res.status).toBe(200);
    const list = await request(app).get('/api/versions').set(auth());
    expect(list.body.versions.find((v: { id: string }) => v.id === id)).toMatchObject({ status: 'interview', appliedAt: '2026-10-01' });
    const version = await request(app).get(`/api/versions/${id}`).set(auth());
    expect(version.body.version.application.notes).toBe('Call on Monday');
    expect(version.body.version.coverLetter).toContain('Dear Hiring Manager');
    const dash = await request(app).get('/api/dashboard').set(auth());
    expect(dash.body.pipeline.interview).toBeGreaterThanOrEqual(1);
    expect((await request(app).patch(`/api/versions/${id}/application`).set(auth()).send({ status: 'hired?' })).status).toBe(400);
    expect((await request(app).patch(`/api/versions/${id}/application`).set(auth()).send({ status: 'applied', appliedAt: 'yesterday' })).status).toBe(400);
  });

  it('shares a read-only copy by link, and can switch it off', async () => {
    const shared = await request(app).post(`/api/versions/${id}/share`).set(auth());
    const shareToken = shared.body.token as string;
    expect(shareToken).toMatch(/^[A-Za-z0-9_-]{24}$/);

    const view = await request(app).get(`/api/shared/${shareToken}`);
    expect(view.status).toBe(200);
    expect(view.body.content.contact.fullName).toBe('Sample Candidate');
    expect(JSON.stringify(view.body)).not.toContain(job.description.slice(0, 30));
    expect(view.body.analysis).toBeUndefined();

    const pdf = await binary(request(app).get(`/api/shared/${shareToken}/pdf`));
    expect(pdf.headers['content-type']).toBe('application/pdf');

    // the same link comes back when sharing is switched on again
    await request(app).delete(`/api/versions/${id}/share`).set(auth());
    expect((await request(app).get(`/api/shared/${shareToken}`)).status).toBe(404);
    expect((await request(app).post(`/api/versions/${id}/share`).set(auth())).body.token).toBe(shareToken);
    expect((await request(app).get('/api/shared/not-a-real-token')).status).toBe(404);
  });
});
