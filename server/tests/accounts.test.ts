import { MongoMemoryServer } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { connectDb } from '../src/db.js';
import { InviteCode } from '../src/models/InviteCode.js';
import { User } from '../src/models/User.js';
import { TEST_PASSWORD, job, mockAi, profile, testConfig, type MockAi } from './helpers.js';

let mongo: MongoMemoryServer;
let ai: MockAi;
let app: ReturnType<typeof createApp>;
let ownerToken = '';

const as = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDb(testConfig({ MONGODB_URI: mongo.getUri('cv-tailor-accounts') }));
  ai = await mockAi(Array.from({ length: 10 }, () => ({ content: JSON.stringify({ summary: 'A short summary.' }) })));
  app = createApp(testConfig({ AI_API_KEY: 'sk-test', AI_BASE_URL: ai.url, AI_DAILY_LIMIT: '2' }));
  ownerToken = (await request(app).post('/api/auth/login').send({ password: TEST_PASSWORD })).body.token;
});

afterAll(async () => {
  await ai.close();
  await mongoose.disconnect();
  await mongo.stop();
});

async function invite(maxUses = 1) {
  const res = await request(app).post('/api/admin/invites').set(as(ownerToken)).send({ maxUses, note: 'for a friend' });
  expect(res.status).toBe(201);
  return res.body.invite.code as string;
}

async function join(code: string, email: string, password = 'friend-password') {
  return request(app).post('/api/auth/register').send({ code, name: 'A Friend', email, password });
}

describe('accounts and invite codes', () => {
  it('the owner can create readable invite codes', async () => {
    const code = await invite();
    expect(code).toMatch(/^CVT-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    const list = await request(app).get('/api/admin/invites').set(as(ownerToken));
    expect(list.body.invites.some((i: { code: string }) => i.code === code)).toBe(true);
  });

  it('a friend joins with a code, which then cannot be reused', async () => {
    const code = await invite(1);
    const first = await join(code, 'Friend.One@Example.com');
    expect(first.status).toBe(201);
    expect(first.body.token).toBeTruthy();
    const second = await join(code, 'friend.two@example.com');
    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe('invalid_invite');
    expect((await InviteCode.findOne({ code }).lean())!.uses).toBe(1);
  });

  it('rejects bad codes, duplicate emails, weak passwords and invalid emails', async () => {
    expect((await join('CVT-NOPE-NOPE', 'x@example.com')).status).toBe(400);
    const code = await invite(5);
    expect((await join(code, 'dup@example.com')).status).toBe(201);
    expect((await join(code, 'DUP@example.com')).status).toBe(409);
    expect((await join(code, 'short@example.com', 'short')).status).toBe(400);
    expect((await join(code, 'not-an-email', 'long-enough-password')).status).toBe(400);
  });

  it('members sign in with email and password; wrong details get one generic message', async () => {
    const code = await invite();
    await join(code, 'login@example.com', 'correct-password');
    const ok = await request(app).post('/api/auth/login').send({ email: 'LOGIN@example.com', password: 'correct-password' });
    expect(ok.status).toBe(200);
    const wrong = await request(app).post('/api/auth/login').send({ email: 'login@example.com', password: 'nope-nope' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'nope-nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
    // the owner password does not open a member account
    expect((await request(app).post('/api/auth/login').send({ email: 'login@example.com', password: TEST_PASSWORD })).status).toBe(401);
  });

  it("each person's data is private to them", async () => {
    await request(app).put('/api/profile').set(as(ownerToken)).send(profile);
    const code = await invite();
    const member = (await join(code, 'private@example.com')).body.token;
    expect((await request(app).get('/api/profile').set(as(member))).body.profile).toBeNull();

    const created = await request(app)
      .post('/api/versions')
      .set(as(ownerToken))
      .send({ job, content: { contact: profile.contact }, generatedBy: 'demo' });
    const id = created.body.version.id;
    expect((await request(app).get(`/api/versions/${id}`).set(as(member))).status).toBe(404);
    expect((await request(app).delete(`/api/versions/${id}`).set(as(member))).status).toBe(404);
    expect((await request(app).get('/api/versions').set(as(member))).body.versions).toEqual([]);
    expect((await request(app).get(`/api/versions/${id}`).set(as(ownerToken))).status).toBe(200);
  });

  it('members cannot use the admin tools', async () => {
    const member = (await join(await invite(), 'nosy@example.com')).body.token;
    expect((await request(app).get('/api/admin/users').set(as(member))).status).toBe(403);
    expect((await request(app).post('/api/admin/invites').set(as(member)).send({})).status).toBe(403);
  });

  it('the owner can switch a member off, which ends their access at once, and delete them', async () => {
    const member = (await join(await invite(), 'switch@example.com')).body.token;
    const users = (await request(app).get('/api/admin/users').set(as(ownerToken))).body.users as { id: string; email: string }[];
    const target = users.find((u) => u.email === 'switch@example.com')!;
    expect((await request(app).patch(`/api/admin/users/${target.id}`).set(as(ownerToken)).send({ disabled: true })).status).toBe(200);
    expect((await request(app).get('/api/profile').set(as(member))).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: 'switch@example.com', password: 'friend-password' })).status).toBe(403);
    expect((await request(app).delete(`/api/admin/users/${target.id}`).set(as(ownerToken))).status).toBe(204);
    expect(await User.exists({ username: 'switch@example.com' })).toBeNull();
  });

  it('members can change their password and delete their own account', async () => {
    const member = (await join(await invite(), 'self@example.com', 'first-password')).body.token;
    expect((await request(app).post('/api/account/password').set(as(member)).send({ currentPassword: 'wrong-one', newPassword: 'second-password' })).status).toBe(400);
    expect((await request(app).post('/api/account/password').set(as(member)).send({ currentPassword: 'first-password', newPassword: 'second-password' })).status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: 'self@example.com', password: 'second-password' })).status).toBe(200);
    expect((await request(app).delete('/api/account').set(as(member))).status).toBe(200);
    expect((await request(app).get('/api/profile').set(as(member))).status).toBe(401);
    expect((await request(app).delete('/api/account').set(as(ownerToken))).status).toBe(400);
  });

  it('a revoked code stops working', async () => {
    const code = await invite(3);
    const id = (await InviteCode.findOne({ code }).lean())!._id;
    await request(app).delete(`/api/admin/invites/${id}`).set(as(ownerToken));
    expect((await join(code, 'late@example.com')).status).toBe(400);
  });
});

describe('daily AI allowance', () => {
  it('limits each member, shows usage, and leaves the owner unlimited', async () => {
    const member = (await join(await invite(), 'busy@example.com')).body.token;
    await request(app).put('/api/profile').set(as(member)).send(profile);
    const ask = (token: string) => request(app).post('/api/tailor/summary').set(as(token)).send({ job, currentSummary: '' });

    expect((await ask(member)).status).toBe(200);
    expect((await ask(member)).status).toBe(200);
    const third = await ask(member);
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('ai_daily_limit');
    expect((await request(app).get('/api/status').set(as(member))).body.aiUsage).toEqual({ used: 2, limit: 2 });

    for (let i = 0; i < 3; i++) expect((await ask(ownerToken)).status).toBe(200);
    expect((await request(app).get('/api/status').set(as(ownerToken))).body.aiUsage.limit).toBe(0);
  });
});
