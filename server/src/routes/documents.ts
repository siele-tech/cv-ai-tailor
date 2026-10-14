import { randomBytes } from 'node:crypto';
import { Router, type RequestHandler, type Response } from 'express';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import type { Config } from '../config.js';
import { HttpError, notFound } from '../errors.js';
import { ownerIdOf } from '../middleware/auth.js';
import { requireDb } from '../middleware/error.js';
import { MasterProfile } from '../models/Profile.js';
import { TailoredCv } from '../models/TailoredCv.js';
import {
  applicationSchema,
  coverLetterRequestSchema,
  cvContentSchema,
  interviewRequestSchema,
  letterFileRequestSchema,
  linkedinRequestSchema,
  pdfRequestSchema,
  profileSchema,
  refineRequestSchema,
} from '../schemas.js';
import { buildCvDocx, buildLetterDocx } from '../services/docx.js';
import { prepareInterview, writeCoverLetter, writeLinkedin } from '../services/documents.js';
import { profileIsUsable } from '../services/normalizeProfile.js';
import { cvFilename, renderCvPdf, renderCvPdfWithInfo, renderLetterPdf } from '../services/pdf.js';
import { fitOnePage } from '../services/tailor.js';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function sendFile(res: Response, body: Buffer, type: string, filename: string) {
  res
    .status(200)
    .set({
      'Content-Type': type,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(body.length),
      'Cache-Control': 'no-store',
    })
    .send(body);
}

const letterFilename = (company: string, jobTitle: string) => cvFilename(company, jobTitle).replace(/Tailored_CV\.pdf$/, 'Cover_Letter.pdf');
const asDocx = (filename: string) => filename.replace(/\.pdf$/, '.docx');

async function loadUsableProfile(ownerId: string) {
  const doc = await MasterProfile.findOne({ ownerId }).lean();
  const profile = doc ? profileSchema.parse(doc.data) : undefined;
  if (!profile || !profileIsUsable(profile)) {
    throw new HttpError(409, 'Add your experience, skills or education to your master profile first.', 'profile_required');
  }
  return profile;
}

function versionId(value: unknown): string {
  const id = String(value ?? '');
  if (!mongoose.isValidObjectId(id)) throw notFound('That CV version was not found.');
  return id;
}

/** File downloads built from what the client sends; no database needed, so they work offline-ish. */
export function fileRoutes(): Router {
  const router = Router();

  router.post('/pdf/info', async (req, res) => {
    const { content } = pdfRequestSchema.parse(req.body);
    res.json({ pages: (await renderCvPdfWithInfo(content)).pages });
  });

  router.post('/docx', async (req, res) => {
    const { content, jobTitle, company } = pdfRequestSchema.parse(req.body);
    sendFile(res, await buildCvDocx(content), DOCX, asDocx(cvFilename(company, jobTitle)));
  });

  router.post('/letter/pdf', async (req, res) => {
    const { letter, contact, jobTitle, company, design } = letterFileRequestSchema.parse(req.body);
    sendFile(res, await renderLetterPdf(letter, contact, design), 'application/pdf', letterFilename(company, jobTitle));
  });

  router.post('/letter/docx', async (req, res) => {
    const { letter, contact, jobTitle, company } = letterFileRequestSchema.parse(req.body);
    sendFile(res, await buildLetterDocx(letter, contact), DOCX, asDocx(letterFilename(company, jobTitle)));
  });

  return router;
}

/** AI-written documents and per-version extras. Mounted after authentication and requireDb. */
export function documentRoutes(config: Config, aiGuard: RequestHandler): Router {
  const router = Router();

  router.post('/documents/cover-letter', aiGuard, async (req, res) => {
    const { job, content, analysis, tone } = coverLetterRequestSchema.parse(req.body);
    const profile = await loadUsableProfile(ownerIdOf(req));
    res.json(await writeCoverLetter(config, profile, job, content, analysis, tone));
  });

  router.post('/documents/interview', aiGuard, async (req, res) => {
    const { job, content, analysis } = interviewRequestSchema.parse(req.body);
    const profile = await loadUsableProfile(ownerIdOf(req));
    res.json(await prepareInterview(config, profile, job, content, analysis));
  });

  router.post('/documents/linkedin', aiGuard, async (req, res) => {
    const { target } = linkedinRequestSchema.parse(req.body ?? {});
    const profile = await loadUsableProfile(ownerIdOf(req));
    res.json(await writeLinkedin(config, profile, target));
  });

  router.post('/documents/one-page', aiGuard, async (req, res) => {
    const { job, content, analysis } = refineRequestSchema.omit({ instruction: true }).parse(req.body);
    const profile = await loadUsableProfile(ownerIdOf(req));
    res.json({ job, ...(await fitOnePage(config, profile, job, content, analysis)) });
  });

  // ---------- application tracker ----------

  router.patch('/versions/:id/application', async (req, res) => {
    const application = applicationSchema.parse(req.body);
    const doc = await TailoredCv.findOneAndUpdate(
      { _id: versionId(req.params.id), ownerId: ownerIdOf(req) },
      { $set: { application: { ...application, updatedAt: new Date() } } },
      { returnDocument: 'after', runValidators: true },
    )
      .select('application')
      .lean();
    if (!doc) throw notFound('That CV version was not found.');
    res.json({ application: doc.application });
  });

  // ---------- read-only share links ----------

  router.post('/versions/:id/share', async (req, res) => {
    const filter = { _id: versionId(req.params.id), ownerId: ownerIdOf(req) };
    const doc = await TailoredCv.findOne(filter).select('share').lean();
    if (!doc) throw notFound('That CV version was not found.');
    // Re-enabling keeps the same link; a new link is made only the first time.
    const token = doc.share?.token || randomBytes(18).toString('base64url');
    await TailoredCv.updateOne(filter, { $set: { share: { token, enabled: true, createdAt: doc.share?.createdAt ?? new Date() } } });
    res.json({ token, enabled: true });
  });

  router.delete('/versions/:id/share', async (req, res) => {
    const result = await TailoredCv.updateOne({ _id: versionId(req.params.id), ownerId: ownerIdOf(req) }, { $set: { 'share.enabled': false } });
    if (result.matchedCount === 0) throw notFound('That CV version was not found.');
    res.json({ enabled: false });
  });

  return router;
}

/** Public, read-only access to a CV through its share link. No sign-in. */
export function publicShareRoutes(config: Config): Router {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => config.env === 'test',
    message: { error: { code: 'rate_limited', message: 'Too many requests. Please try again later.' } },
  });

  async function loadShared(token: unknown) {
    const value = String(token ?? '');
    if (!/^[A-Za-z0-9_-]{20,40}$/.test(value)) throw notFound('This link is not valid or has been switched off.');
    const doc = await TailoredCv.findOne({ 'share.token': value, 'share.enabled': true }).select('content job.title job.company updatedAt').lean();
    if (!doc) throw notFound('This link is not valid or has been switched off.');
    return { content: cvContentSchema.parse(doc.content), jobTitle: doc.job.title, company: doc.job.company ?? '', updatedAt: doc.updatedAt };
  }

  router.get('/shared/:token', limiter, requireDb, async (req, res) => {
    const shared = await loadShared(req.params.token);
    // Only the CV itself: the job description, analysis and notes stay private.
    res.json({ content: shared.content, jobTitle: shared.jobTitle, updatedAt: shared.updatedAt });
  });

  router.get('/shared/:token/pdf', limiter, requireDb, async (req, res) => {
    const shared = await loadShared(req.params.token);
    const name = shared.content.contact.fullName.trim();
    sendFile(res, await renderCvPdf(shared.content), 'application/pdf', name ? cvFilename(name, 'CV').replace('_Tailored_CV', '') : 'CV.pdf');
  });

  return router;
}
