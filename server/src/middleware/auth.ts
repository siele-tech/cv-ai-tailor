import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Config } from '../config.js';
import { HttpError } from '../errors.js';

declare module 'express-serve-static-core' {
  interface Request {
    ownerId?: string;
  }
}

const TOKEN_TTL = '7d';

/** Constant-time comparison; hashing first makes both inputs the same length. */
export function passwordMatches(candidate: string, expected: string): boolean {
  const a = createHash('sha256').update(candidate).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function issueToken(config: Config, ownerId: string): string {
  return jwt.sign({ sub: ownerId }, config.jwtSecret, { expiresIn: TOKEN_TTL, algorithm: 'HS256' });
}

export function requireAuth(config: Config) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return next(new HttpError(401, 'Please sign in.', 'unauthorized'));
    try {
      const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
      if (typeof payload === 'string' || typeof payload.sub !== 'string') throw new Error('bad payload');
      req.ownerId = payload.sub;
      next();
    } catch {
      next(new HttpError(401, 'Your session has expired. Please sign in again.', 'unauthorized'));
    }
  };
}

export function ownerIdOf(req: Request): string {
  if (!req.ownerId) throw new HttpError(401, 'Please sign in.', 'unauthorized');
  return req.ownerId;
}
