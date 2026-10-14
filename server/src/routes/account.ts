import { randomBytes } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import mongoose from 'mongoose';
import type { Config } from '../config.js';
import { HttpError, notFound } from '../errors.js';
import { hashPassword, issueToken, ownerIdOf, passwordMatches, requireAdmin, verifyPassword } from '../middleware/auth.js';
import { requireDb } from '../middleware/error.js';
import { InviteCode } from '../models/InviteCode.js';
import { MasterProfile } from '../models/Profile.js';
import { TailoredCv } from '../models/TailoredCv.js';
import { User } from '../models/User.js';
import { inviteCreateSchema, loginSchema, passwordChangeSchema, registerSchema, userUpdateSchema } from '../schemas.js';

export const OWNER_USERNAME = 'owner';
const BAD_LOGIN = 'Incorrect email or password.';

/** Codes like "CVT-7KQ2-M9PX": no 0/O/1/I, easy to read out or type on a phone. */
function newInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
  return `CVT-${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

function idParam(id: unknown): string {
  const value = String(id ?? '');
  if (!mongoose.isValidObjectId(value)) throw notFound();
  return value;
}

/** Remove a person's CV data (and optionally the account itself). */
export async function deleteUserData(userId: string, deleteAccount: boolean) {
  const [versions] = await Promise.all([
    TailoredCv.deleteMany({ ownerId: userId }),
    MasterProfile.deleteOne({ ownerId: userId }),
    deleteAccount ? User.deleteOne({ _id: userId }) : User.updateOne({ _id: userId }, { $unset: { layout: 1 } }),
  ]);
  return versions.deletedCount;
}

/** Routes that need no session: signing in and joining with an invite code. */
export function publicAccountRouter(config: Config, limiter: RequestHandler): Router {
  const router = Router();

  router.post('/auth/login', limiter, requireDb, async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);

    if (!email || email === OWNER_USERNAME) {
      // The owner signs in with the password set in the server environment.
      if (!passwordMatches(password, config.appPassword)) throw new HttpError(401, BAD_LOGIN, 'invalid_credentials');
      const owner = await User.findOneAndUpdate(
        { username: OWNER_USERNAME },
        { $set: { lastLoginAt: new Date(), role: 'admin', disabled: false } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      );
      return res.json({ token: issueToken(config, String(owner._id), 'admin') });
    }

    const user = await User.findOne({ username: email });
    // Hash even when the user does not exist, so response time does not reveal which emails are registered.
    const ok = await verifyPassword(password, user?.passwordHash || 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    if (!user || !ok || !user.passwordHash) throw new HttpError(401, BAD_LOGIN, 'invalid_credentials');
    if (user.disabled) throw new HttpError(403, 'This account has been switched off by the app owner.', 'account_disabled');
    user.lastLoginAt = new Date();
    await user.save();
    res.json({ token: issueToken(config, String(user._id), user.role) });
  });

  router.post('/auth/register', limiter, requireDb, async (req, res) => {
    const { code, name, email, password } = registerSchema.parse(req.body);
    if (email === OWNER_USERNAME) throw new HttpError(400, 'Choose a different email address.', 'bad_request');
    if (await User.exists({ username: email })) {
      throw new HttpError(409, 'An account with this email already exists. Sign in instead.', 'email_taken');
    }
    // Claim one use of the code atomically, so a single-use code cannot be used twice at once.
    const invite = await InviteCode.findOneAndUpdate(
      { code, revoked: false, $expr: { $lt: ['$uses', '$maxUses'] } },
      { $inc: { uses: 1 } },
      { returnDocument: 'after' },
    );
    if (!invite) throw new HttpError(400, 'That invite code is not valid, or it has already been used.', 'invalid_invite');
    try {
      const user = await User.create({ username: email, name, role: 'member', passwordHash: await hashPassword(password), invitedWith: code, lastLoginAt: new Date() });
      res.status(201).json({ token: issueToken(config, String(user._id), 'member') });
    } catch (err) {
      await InviteCode.updateOne({ _id: invite._id }, { $inc: { uses: -1 } });
      if ((err as { code?: number }).code === 11000) throw new HttpError(409, 'An account with this email already exists. Sign in instead.', 'email_taken');
      throw err;
    }
  });

  return router;
}

/** Routes for a signed-in person: their account, and the owner's admin tools. */
export function accountRouter(config: Config): Router {
  const router = Router();
  router.use(requireDb);

  router.get('/account', async (req, res) => {
    const user = await User.findById(ownerIdOf(req)).select('username name role createdAt').lean();
    if (!user) throw notFound();
    res.json({ account: { name: user.name, email: user.role === 'admin' ? '' : user.username, role: user.role, createdAt: user.createdAt } });
  });

  router.post('/account/password', async (req, res) => {
    const { currentPassword, newPassword } = passwordChangeSchema.parse(req.body);
    if (req.role === 'admin') throw new HttpError(400, 'The owner password is set on the server (APP_PASSWORD).', 'bad_request');
    const user = await User.findById(ownerIdOf(req));
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) throw new HttpError(400, 'Your current password is not correct.', 'invalid_credentials');
    user.passwordHash = await hashPassword(newPassword);
    await user.save();
    res.json({ ok: true });
  });

  router.delete('/account', async (req, res) => {
    if (req.role === 'admin') throw new HttpError(400, 'The owner account cannot be deleted. Use "Delete all my data" instead.', 'bad_request');
    const deletedVersions = await deleteUserData(ownerIdOf(req), true);
    res.json({ deletedVersions });
  });

  // ---------- owner only ----------

  router.get('/admin/invites', requireAdmin, async (_req, res) => {
    const invites = await InviteCode.find().sort({ createdAt: -1 }).limit(100).lean();
    res.json({ invites: invites.map((i) => ({ id: String(i._id), code: i.code, note: i.note, maxUses: i.maxUses, uses: i.uses, revoked: i.revoked, createdAt: i.createdAt })) });
  });

  router.post('/admin/invites', requireAdmin, async (req, res) => {
    const { maxUses, note } = inviteCreateSchema.parse(req.body);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const invite = await InviteCode.create({ code: newInviteCode(), createdBy: ownerIdOf(req), maxUses, note });
        return res.status(201).json({ invite: { id: String(invite._id), code: invite.code, note: invite.note, maxUses: invite.maxUses, uses: 0, revoked: false, createdAt: invite.createdAt } });
      } catch (err) {
        if ((err as { code?: number }).code !== 11000) throw err;
      }
    }
    throw new HttpError(500, 'Could not create a unique code. Please try again.');
  });

  router.delete('/admin/invites/:id', requireAdmin, async (req, res) => {
    const result = await InviteCode.updateOne({ _id: idParam(req.params.id) }, { $set: { revoked: true } });
    if (result.matchedCount === 0) throw notFound('That invite code was not found.');
    res.status(204).end();
  });

  router.get('/admin/users', requireAdmin, async (_req, res) => {
    const users = await User.find().sort({ createdAt: 1 }).select('username name role disabled lastLoginAt createdAt aiUsage').lean();
    const counts = await TailoredCv.aggregate<{ _id: unknown; n: number }>([{ $group: { _id: '$ownerId', n: { $sum: 1 } } }]);
    const cvCount = new Map(counts.map((c) => [String(c._id), c.n]));
    const date = new Date().toISOString().slice(0, 10);
    res.json({
      users: users.map((u) => ({
        id: String(u._id),
        name: u.role === 'admin' ? u.name || 'You (owner)' : u.name,
        email: u.role === 'admin' ? '' : u.username,
        role: u.role,
        disabled: u.disabled,
        lastLoginAt: u.lastLoginAt ?? null,
        createdAt: u.createdAt,
        savedCvs: cvCount.get(String(u._id)) ?? 0,
        aiToday: u.aiUsage?.date === date ? u.aiUsage.count : 0,
      })),
      dailyLimit: config.aiDailyLimit,
    });
  });

  router.patch('/admin/users/:id', requireAdmin, async (req, res) => {
    const id = idParam(req.params.id);
    const { disabled } = userUpdateSchema.parse(req.body);
    if (id === ownerIdOf(req)) throw new HttpError(400, 'You cannot switch off your own account.', 'bad_request');
    const result = await User.updateOne({ _id: id, role: 'member' }, { $set: { disabled } });
    if (result.matchedCount === 0) throw notFound('That person was not found.');
    res.json({ ok: true });
  });

  router.delete('/admin/users/:id', requireAdmin, async (req, res) => {
    const id = idParam(req.params.id);
    if (id === ownerIdOf(req)) throw new HttpError(400, 'You cannot delete your own account.', 'bad_request');
    const target = await User.findOne({ _id: id, role: 'member' }).select('_id').lean();
    if (!target) throw notFound('That person was not found.');
    await deleteUserData(id, true);
    res.status(204).end();
  });

  return router;
}

