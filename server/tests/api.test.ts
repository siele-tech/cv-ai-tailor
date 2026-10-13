import { MongoMemoryServer } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { connectDb } from '../src/db.js';
import { renderCvPdf } from '../src/services/pdf.js';
import { CV_LINES, TEST_PASSWORD, job, makeDocx, profile, sampleContent, testConfig } from './helpers.js';

let mongo: MongoMemoryServer;
let token = '';
const app = createApp(testConfig());
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDb(testConfig({ MONGODB_URI: mongo.getUri('cv-tailor-test') }));
  const res = await request(app).post('/api/auth/login').send({ password: TEST_PASSWORD });
  token = res.body.token;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await request(app).delete('/api/data').set(auth());
});

const saveProfile = () => request(app).put('/api/profile').set(auth()).send(profile);

describe('authentication', () => {
  it('reports health without authentication', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'connected' });
  });

  it('rejects a wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  it.each([
    ['get', '/api/profile'],
    ['put', '/api/profile'],
    ['get', '/api/versions'],
    ['get', '/api/versions/000000000000000000000000'],
    ['post', '/api/tailor'],
    ['post', '/api/pdf'],
    ['post', '/api/profile/extract'],
    ['delete', '/api/data'],
    ['get', '/api/status'],
    ['get', '/api/dashboard'],
  ] as const)('%s %s requires a session', async (method, path) => {
    expect((await request(app)[method](path)).status).toBe(401);
    expect((await request(app)[method](path).set('Authorization', 'Bearer not-a-token')).status).toBe(401);
  });

  it('sets security headers and never caches API responses', async () => {
    const res = await request(app).get('/api/status').set(auth());
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.body).toMatchObject({ aiConfigured: false, aiModel: '' });
  });
});

describe('master profile', () => {
  it('starts empty, then saves and returns the profile', async () => {
    expect((await request(app).get('/api/profile').set(auth())).body.profile).toBeNull();
    const saved = await saveProfile();
    expect(saved.status).toBe(200);
    const res = await request(app).get('/api/profile').set(auth());
    expect(res.body.profile).toEqual(profile);
    expect(res.body.updatedAt).toBeTruthy();
  });

  it('rejects invalid data and keeps the saved profile intact', async () => {
    await saveProfile();
    const bad = await request(app).put('/api/profile').set(auth()).send({ contact: { fullName: 'x'.repeat(500) }, experience: 'nope' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('validation_error');
    expect((await request(app).get('/api/profile').set(auth())).body.profile).toEqual(profile);
  });

  it('ignores MongoDB operators smuggled into the body', async () => {
    const res = await request(app).put('/api/profile').set(auth()).send({ ...profile, $where: 'sleep(1000)', ownerId: 'someone-else' });
    expect(res.status).toBe(200);
    expect(res.body.profile.$where).toBeUndefined();
    expect(res.body.profile.ownerId).toBeUndefined();
  });

  it('rejects malformed JSON', async () => {
    const res = await request(app).put('/api/profile').set(auth()).set('Content-Type', 'application/json').send('{"contact":');
    expect(res.status).toBe(400);
  });
});

describe('CV upload', () => {
  const upload = (buffer: Buffer, filename: string) =>
    request(app).post('/api/profile/extract').set(auth()).attach('file', buffer, filename);

  it('extracts a DOCX for review without saving anything', async () => {
    const res = await upload(await makeDocx(CV_LINES), 'cv.docx');
    expect(res.status).toBe(200);
    expect(res.body.method).toBe('basic');
    expect(res.body.profile.contact.email).toBe('jordan@example.com');
    expect(res.body.profile.experience).toHaveLength(2);
    expect((await request(app).get('/api/profile').set(auth())).body.profile).toBeNull();
  });

  it('extracts a PDF', async () => {
    const res = await upload(await renderCvPdf(sampleContent()), 'cv.pdf');
    expect(res.status).toBe(200);
    expect(res.body.profile.contact.email).toBe('sample.candidate@example.com');
    expect(res.body.profile.skills.technical).toContain('TypeScript');
  });

  it('rejects unsupported, disguised, corrupted, oversized and missing files', async () => {
    expect((await upload(Buffer.from('plain text'), 'cv.txt')).status).toBe(415);
    expect((await upload(Buffer.from('plain text pretending'), 'cv.pdf')).status).toBe(415);
    expect((await upload(Buffer.from('%PDF-1.7\ngarbage garbage garbage'), 'cv.pdf')).status).toBe(422);
    expect((await upload(Buffer.alloc(6 * 1024 * 1024, 1), 'big.pdf')).status).toBe(413);
    expect((await request(app).post('/api/profile/extract').set(auth())).status).toBe(400);
  });
});

describe('tailoring (demo mode: no AI key in tests)', () => {
  it('requires a master profile first', async () => {
    const res = await request(app).post('/api/tailor').set(auth()).send(job);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('profile_required');
  });

  it('validates the job description', async () => {
    await saveProfile();
    const res = await request(app).post('/api/tailor').set(auth()).send({ ...job, title: '', description: 'too short' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.join(' ')).toMatch(/title/);
  });

  it('generates a CV without saving it or touching the master profile', async () => {
    await saveProfile();
    const res = await request(app).post('/api/tailor').set(auth()).send(job);
    expect(res.status).toBe(200);
    expect(res.body.generatedBy).toBe('demo');
    expect(res.body.content.contact.fullName).toBe('Sample Candidate');
    expect(res.body.analysis.missingSkills).toEqual(expect.arrayContaining(['Kubernetes']));
    expect(res.body.job.emphasis).toBe('Fintech');

    expect((await request(app).get('/api/profile').set(auth())).body.profile).toEqual(profile);
    expect((await request(app).get('/api/versions').set(auth())).body.versions).toEqual([]);
  });
});

describe('saved versions', () => {
  const versionBody = (overrides = {}) => ({
    job,
    content: sampleContent(),
    analysis: { score: 50, matchedSkills: ['Node.js'] },
    generatedBy: 'demo',
    ...overrides,
  });
  const create = (overrides = {}) => request(app).post('/api/versions').set(auth()).send(versionBody(overrides));

  it('saves, lists, loads, updates and deletes a version', async () => {
    const created = await create();
    expect(created.status).toBe(201);
    const id = created.body.version.id;

    const list = await request(app).get('/api/versions').set(auth());
    expect(list.body.versions).toHaveLength(1);
    expect(list.body.versions[0]).toMatchObject({ id, jobTitle: 'Backend Engineer', company: 'Acme Bank', emphasis: 'Fintech' });
    expect(list.body.versions[0].content).toBeUndefined();

    const content = sampleContent();
    content.summary = 'Edited by hand.';
    const updated = await request(app).put(`/api/versions/${id}`).set(auth()).send(versionBody({ content }));
    expect(updated.status).toBe(200);

    const loaded = await request(app).get(`/api/versions/${id}`).set(auth());
    expect(loaded.body.version.content.summary).toBe('Edited by hand.');
    expect(loaded.body.version.job.description).toBe(job.description);

    expect((await request(app).delete(`/api/versions/${id}`).set(auth())).status).toBe(204);
    expect((await request(app).get(`/api/versions/${id}`).set(auth())).status).toBe(404);
    expect((await request(app).delete(`/api/versions/${id}`).set(auth())).status).toBe(404);
  });

  it('keeps versions independent of each other and of the master profile', async () => {
    await saveProfile();
    const a = (await create()).body.version.id;
    const b = (await create({ job: { ...job, company: 'Other Corp' } })).body.version.id;

    const content = sampleContent();
    content.experience = [];
    await request(app).put(`/api/versions/${a}`).set(auth()).send(versionBody({ content }));

    const other = await request(app).get(`/api/versions/${b}`).set(auth());
    expect(other.body.version.content.experience).toHaveLength(2);
    expect(other.body.version.job.company).toBe('Other Corp');
    expect((await request(app).get('/api/profile').set(auth())).body.profile).toEqual(profile);

    // Generating again must not disturb what is already saved.
    await request(app).post('/api/tailor').set(auth()).send(job);
    expect((await request(app).get('/api/versions').set(auth())).body.versions).toHaveLength(2);
  });

  it('returns 404 for malformed or unknown ids', async () => {
    expect((await request(app).get('/api/versions/not-an-id').set(auth())).status).toBe(404);
    expect((await request(app).get('/api/versions/000000000000000000000000').set(auth())).status).toBe(404);
    expect((await request(app).put('/api/versions/000000000000000000000000').set(auth()).send(versionBody())).status).toBe(404);
  });

  it('rejects invalid versions', async () => {
    expect((await create({ job: { title: '' } })).status).toBe(400);
    expect((await create({ generatedBy: 'human' })).status).toBe(400);
  });

  it('summarises the dashboard', async () => {
    await saveProfile();
    await create();
    await create({ job: { ...job, title: 'Data Analyst' } });
    const res = await request(app).get('/api/dashboard').set(auth());
    expect(res.body.totalVersions).toBe(2);
    expect(res.body.recent[0].jobTitle).toBe('Data Analyst');
    expect(res.body.profile).toMatchObject({ exists: true, usable: true, fullName: 'Sample Candidate' });
  });

  it('deletes all stored data on request', async () => {
    await saveProfile();
    await create();
    const res = await request(app).delete('/api/data').set(auth());
    expect(res.body.deletedVersions).toBe(1);
    expect((await request(app).get('/api/profile').set(auth())).body.profile).toBeNull();
    expect((await request(app).get('/api/versions').set(auth())).body.versions).toEqual([]);
  });
});

describe('PDF download', () => {
  it('returns a PDF of exactly the content sent, with a sanitised filename', async () => {
    const content = sampleContent();
    content.summary = 'Freshly edited summary.';
    const res = await request(app)
      .post('/api/pdf')
      .set(auth())
      .send({ content, jobTitle: 'Senior "Dev"\r\nX-Injected: 1', company: 'Acme/Bank' })
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="Acme_Bank_Senior_Dev_X_Injected_1_Tailored_CV.pdf"');
    expect(res.headers['x-injected']).toBeUndefined();
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('rejects invalid content', async () => {
    const res = await request(app).post('/api/pdf').set(auth()).send({ content: { experience: 'nope' } });
    expect(res.status).toBe(400);
  });
});

describe('configuration', () => {
  it('refuses to start in production without credentials and a database', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/APP_PASSWORD[\s\S]*JWT_SECRET[\s\S]*MONGODB_URI/);
    expect(() => loadConfig({ NODE_ENV: 'production', APP_PASSWORD: 'short', JWT_SECRET: 'x'.repeat(40), MONGODB_URI: 'mongodb://x' })).toThrow(/APP_PASSWORD/);
  });

  it('treats untouched .env.example placeholders as unset', () => {
    const config = loadConfig({
      AI_API_KEY: '<your-provider-api-key>',
      MONGODB_URI: 'mongodb+srv://<db-user>:<db-password>@<cluster-host>/cv-tailor',
      APP_PASSWORD: '<choose-a-long-passphrase>',
    });
    expect(config.ai.apiKey).toBe('');
    expect(config.mongoUri).toBe('');
    expect(config.usingDevCredentials).toBe(true);
  });

  it('only allows configured cross-origin callers', async () => {
    const corsApp = createApp(testConfig({ CORS_ORIGINS: 'https://app.example.com/' }));
    const allowed = await request(corsApp).get('/api/health').set('Origin', 'https://app.example.com');
    expect(allowed.headers['access-control-allow-origin']).toBe('https://app.example.com');
    const denied = await request(corsApp).get('/api/health').set('Origin', 'https://evil.example.com');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    const sameOrigin = await request(app).get('/api/health').set('Origin', 'https://evil.example.com');
    expect(sameOrigin.headers['access-control-allow-origin']).toBeUndefined();
  });
});

// Keep this block last: it disconnects the database.
describe('database outage', () => {
  it('answers with 503 instead of hanging or losing data silently', async () => {
    await mongoose.disconnect();

    const health = await request(app).get('/api/health');
    expect(health.status).toBe(503);
    expect(health.body.db).toBe('disconnected');

    for (const res of [
      await request(app).get('/api/profile').set(auth()),
      await request(app).put('/api/profile').set(auth()).send(profile),
      await request(app).post('/api/versions').set(auth()).send({ job, content: sampleContent(), generatedBy: 'demo' }),
      await request(app).post('/api/auth/login').send({ password: TEST_PASSWORD }),
    ]) {
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('db_unavailable');
    }

    // PDF export does not depend on the database, so work in progress can still be downloaded.
    const pdf = await request(app).post('/api/pdf').set(auth()).send({ content: sampleContent() });
    expect(pdf.status).toBe(200);
  });

  it('fails fast when the database cannot be reached at all', async () => {
    const started = Date.now();
    await expect(
      mongoose.createConnection('mongodb://127.0.0.1:9/unreachable', { serverSelectionTimeoutMS: 1500 }).asPromise(),
    ).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});
