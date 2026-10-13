import type { NextFunction, Request, Response } from 'express';

// Deliberately minimal: log operational facts only. Never log request bodies, CV text,
// identity details, tokens, or keys.
const silent = () => process.env.NODE_ENV === 'test';

export const log = {
  info(message: string) {
    if (!silent()) console.log(`[info] ${message}`);
  },
  warn(message: string) {
    if (!silent()) console.warn(`[warn] ${message}`);
  },
  error(message: string) {
    if (!silent()) console.error(`[error] ${message}`);
  },
};

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const started = Date.now();
  // Path only (no query string) so nothing user-supplied ends up in logs. Captured now,
  // because routers rewrite req.url while a request is being handled.
  const route = req.originalUrl.split('?')[0] ?? '';
  res.on('finish', () => {
    if (route === '/api/health' && res.statusCode === 200) return;
    log.info(`${req.method} ${route} ${res.statusCode} ${Date.now() - started}ms`);
  });
  next();
}
