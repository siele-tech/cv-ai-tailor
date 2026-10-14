import type { NextFunction, Request, Response } from 'express';
import { aiConfigured, type Config } from '../config.js';
import { dbConnected } from '../db.js';
import { HttpError } from '../errors.js';
import { User } from '../models/User.js';

const today = () => new Date().toISOString().slice(0, 10);

export function dailyLimitFor(config: Config, role: string | undefined): number {
  return role === 'admin' ? config.aiDailyLimitOwner : config.aiDailyLimit;
}

/** AI requests used today, for display. */
export async function usageToday(userId: string): Promise<number> {
  const user = await User.findById(userId).select('aiUsage').lean();
  return user?.aiUsage?.date === today() ? (user.aiUsage.count ?? 0) : 0;
}

/**
 * Per-person daily cap on AI requests, so one person cannot use up the shared AI quota.
 * Counted only when an AI provider is configured (demo mode costs nothing).
 */
export function aiQuota(config: Config) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const limit = dailyLimitFor(config, req.role);
    if (!aiConfigured(config) || limit === 0 || !dbConnected() || !req.ownerId) return next();
    const date = today();
    try {
      // Same day and under the limit: count it.
      const counted = await User.updateOne(
        { _id: req.ownerId, 'aiUsage.date': date, 'aiUsage.count': { $lt: limit } },
        { $inc: { 'aiUsage.count': 1 } },
      );
      if (counted.modifiedCount === 1) return next();
      // First request of a new day: start counting again.
      const reset = await User.updateOne({ _id: req.ownerId, 'aiUsage.date': { $ne: date } }, { $set: { aiUsage: { date, count: 1 } } });
      if (reset.modifiedCount === 1) return next();
      next(new HttpError(429, `You have used today's ${limit} AI requests. The limit resets at midnight (UTC).`, 'ai_daily_limit'));
    } catch (err) {
      next(err);
    }
  };
}
