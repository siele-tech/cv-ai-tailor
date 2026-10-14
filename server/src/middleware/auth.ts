import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Config } from '../config.js';
import { dbConnected } from '../db.js';
import { HttpError } from '../errors.js';
import { User, type Role } from '../models/User.js';

declare module 'express-serve-static-core' {
  interface Request {
    ownerId?: string;
    role?: Role;
  }
}

const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keylen: number, options: { N: number; r: number; p: number }) => Promise<Buffer>;
const TOKEN_TTL = '7d';
const SCRYPT = { N: 16384, r: 8, p: 1 };

/** Constant-time comparison; hashing first makes both inputs the same length. */
export function passwordMatches(candidate: string, expected: string): boolean {
  const a = createHash('sha256').update(candidate).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/** "scrypt$N$r$p$salt$hash", all base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 32, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64url'), hash.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, n, r, p, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await scrypt(password, Buffer.from(salt, 'base64url'), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function issueToken(config: Config, userId: string, role: Role): string {
  return jwt.sign({ sub: userId, role }, config.jwtSecret, { expiresIn: TOKEN_TTL, algorithm: 'HS256' });
}

export function requireAuth(config: Config) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return next(new HttpError(401, 'Please sign in.', 'unauthorized'));
    let payload: jwt.JwtPayload;
    try {
      const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
      if (typeof decoded === 'string' || typeof decoded.sub !== 'string') throw new Error('bad payload');
      payload = decoded;
    } catch {
      return next(new HttpError(401, 'Your session has expired. Please sign in again.', 'unauthorized'));
    }
    req.ownerId = payload.sub;
    req.role = payload.role === 'admin' ? 'admin' : 'member';

    // Deleted or disabled accounts lose access at once. When the database is briefly down the
    // signed token is trusted, so work in progress (such as PDF downloads) keeps working.
    if (dbConnected()) {
      try {
        const user = await User.findById(payload.sub).select('role disabled').lean();
        if (!user || user.disabled) {
          return next(new HttpError(401, 'This account is not active. Please contact the person who invited you.', 'unauthorized'));
        }
        req.role = user.role;
      } catch (err) {
        return next(err);
      }
    }
    next();
  };
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.role !== 'admin') return next(new HttpError(403, 'Only the app owner can do that.', 'forbidden'));
  next();
}

export function ownerIdOf(req: Request): string {
  if (!req.ownerId) throw new HttpError(401, 'Please sign in.', 'unauthorized');
  return req.ownerId;
}
