import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { ZodError } from 'zod';
import { dbConnected } from '../db.js';
import { HttpError } from '../errors.js';
import { log } from '../logger.js';
import { describeIssues } from '../schemas.js';

const DB_DOWN = 'The database is unavailable right now. Nothing was changed. Please try again shortly.';

export function requireDb(_req: Request, _res: Response, next: NextFunction) {
  if (dbConnected()) return next();
  next(new HttpError(503, DB_DOWN, 'db_unavailable'));
}

export function apiNotFound(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
}

function isDbError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err instanceof mongoose.Error.MongooseServerSelectionError ||
    /^Mongo(Server|Network|ServerSelection|NotConnected|Topology)/.test(err.name) ||
    /buffering timed out|bufferCommands = false/.test(err.message)
  );
}

// Express identifies error handlers by their four-argument signature.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let status = 500;
  let code = 'internal_error';
  let message = 'Something went wrong. Please try again.';
  let details: string[] | undefined;
  const bodyParserType = (err as { type?: string } | null)?.type;

  if (err instanceof HttpError) {
    ({ status, code, message, details } = err);
  } else if (err instanceof ZodError) {
    status = 400;
    code = 'validation_error';
    message = 'Some of the information provided is not valid.';
    details = describeIssues(err);
  } else if (err instanceof multer.MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    code = 'upload_error';
    message = err.code === 'LIMIT_FILE_SIZE' ? 'That file is too large.' : 'The upload could not be processed.';
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    code = 'validation_error';
    message = 'The data could not be saved because it is not valid.';
  } else if (err instanceof mongoose.Error.CastError) {
    status = 404;
    code = 'not_found';
    message = 'Not found';
  } else if (isDbError(err)) {
    status = 503;
    code = 'db_unavailable';
    message = DB_DOWN;
  } else if (bodyParserType === 'entity.too.large') {
    status = 413;
    code = 'too_large';
    message = 'The request is too large.';
  } else if (bodyParserType === 'entity.parse.failed') {
    status = 400;
    code = 'bad_request';
    message = 'The request body is not valid JSON.';
  }

  if (status >= 500) {
    // Error class and route only. Messages can contain user content or connection strings.
    const name = err instanceof Error ? err.name : typeof err;
    log.error(`${req.method} ${req.path} failed: ${name} (${code})`);
  }

  res.status(status).json({ error: { code, message, ...(details?.length ? { details } : {}) } });
}
