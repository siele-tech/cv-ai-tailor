import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import multer from 'multer';
import { aiConfigured, type Config } from '../config.js';
import { dbConnected, dbState } from '../db.js';
import { HttpError, badRequest, notFound } from '../errors.js';
import { issueToken, ownerIdOf, passwordMatches, requireAuth } from '../middleware/auth.js';
import { requireDb } from '../middleware/error.js';
import { MasterProfile } from '../models/Profile.js';
import { TailoredCv } from '../models/TailoredCv.js';
import { User } from '../models/User.js';
import {
  jobSchema,
  loginSchema,
  parseLayout,
  pdfRequestSchema,
  profileSchema,
  refineRequestSchema,
  restyleRequestSchema,
  regenerateSummarySchema,
  versionInputSchema,
  type Layout,
  type Profile,
} from '../schemas.js';
import { sampleProfile } from '../services/demo.js';
import { detectKind, extractText } from '../services/extractText.js';
import { profileIsUsable } from '../services/normalizeProfile.js';
import { cvFilename, renderCvPdf } from '../services/pdf.js';
import { extractLayout, extractProfile, refineCv, regenerateSummary, restyleCv, tailorCv } from '../services/tailor.js';

const OWNER_USERNAME = 'owner';

function versionId(req: Request): string {
  const id = String(req.params.id ?? '');
  if (!mongoose.isValidObjectId(id)) throw notFound('That CV version was not found.');
  return id;
}

async function loadProfile(ownerId: string): Promise<Profile> {
  const doc = await MasterProfile.findOne({ ownerId }).lean();
  // Re-parse so profiles saved by an older version of the schema still get current defaults.
  const profile = doc ? profileSchema.parse(doc.data) : undefined;
  if (!profile || !profileIsUsable(profile)) {
    throw new HttpError(409, 'Add your experience, skills or education to your master profile before tailoring a CV.', 'profile_required');
  }
  return profile;
}

/** The owner's preferred CV structure, or the default one. */
async function loadLayout(ownerId: string): Promise<Layout> {
  const owner = await User.findById(ownerId).select('layout').lean();
  return parseLayout(owner?.layout);
}

export function apiRouter(config: Config): Router {
  const router = Router();
  const testing = config.env === 'test';

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => testing,
    message: { error: { code: 'rate_limited', message: 'Too many sign-in attempts. Please wait 15 minutes and try again.' } },
  });
  // AI calls cost money; keep a ceiling even for the authenticated owner.
  const aiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 40,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => testing,
    message: { error: { code: 'rate_limited', message: 'Hourly limit for AI requests reached. Please try again later.' } },
  });

  const upload = multer({
    storage: multer.memoryStorage(), // never written to disk; discarded after the request
    limits: { fileSize: config.maxUploadBytes, files: 1, fields: 0 },
  });
  // A file plus one JSON field describing the CV it applies to.
  const uploadWithPayload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadBytes, files: 1, fields: 1, fieldSize: 1024 * 1024 },
  });

  // ---------- public ----------

  router.get('/health', (_req, res) => {
    const connected = dbConnected();
    res.status(connected ? 200 : 503).json({ status: connected ? 'ok' : 'degraded', db: connected ? 'connected' : 'disconnected' });
  });

  router.post('/auth/login', loginLimiter, requireDb, async (req, res) => {
    const { password } = loginSchema.parse(req.body);
    if (!passwordMatches(password, config.appPassword)) {
      throw new HttpError(401, 'Incorrect password.', 'invalid_credentials');
    }
    const owner = await User.findOneAndUpdate(
      { username: OWNER_USERNAME },
      { $set: { lastLoginAt: new Date() } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );
    res.json({ token: issueToken(config, owner.id as string) });
  });

  // ---------- everything below requires a valid session ----------

  router.use(requireAuth(config));

  router.get('/status', (_req, res) => {
    res.json({
      aiConfigured: aiConfigured(config),
      aiModel: aiConfigured(config) ? config.ai.model : '',
      dbPersistent: dbState.persistent,
      maxUploadMb: Math.round(config.maxUploadBytes / 1024 / 1024),
    });
  });

  // PDF rendering needs no database: the client sends the content it is currently showing,
  // so the download always reflects the latest edits.
  router.post('/pdf', async (req, res) => {
    const { content, jobTitle, company } = pdfRequestSchema.parse(req.body);
    const pdf = await renderCvPdf(content);
    const filename = cvFilename(company, jobTitle);
    res
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdf.length),
        'Cache-Control': 'no-store',
      })
      .send(pdf);
  });

  router.get('/profile/sample', (_req, res) => {
    res.json({ profile: sampleProfile() });
  });

  router.post('/profile/extract', aiLimiter, upload.single('file'), async (req, res) => {
    if (!req.file) throw badRequest('Choose a PDF or DOCX file to upload.');
    const kind = detectKind(req.file.buffer, req.file.originalname);
    const text = await extractText(req.file.buffer, kind);
    // Returned for review only. Nothing is saved until the user confirms on the profile screen.
    res.json(await extractProfile(config, text));
  });

  router.post('/layout/extract', aiLimiter, upload.single('file'), async (req, res) => {
    if (!req.file) throw badRequest('Choose a PDF or DOCX file to upload.');
    const kind = detectKind(req.file.buffer, req.file.originalname);
    const text = await extractText(req.file.buffer, kind);
    // Only the headings are used. The document's content is discarded and nothing is saved here.
    res.json(await extractLayout(config, text));
  });

  router.use(requireDb);

  // ---------- CV structure ----------

  router.get('/layout', async (req, res) => {
    res.json({ layout: await loadLayout(ownerIdOf(req)) });
  });

  router.put('/layout', async (req, res) => {
    const layout = parseLayout((req.body as { layout?: unknown } | undefined)?.layout);
    await User.updateOne({ _id: ownerIdOf(req) }, { $set: { layout } });
    res.json({ layout });
  });

  // ---------- master profile ----------

  router.get('/profile', async (req, res) => {
    const doc = await MasterProfile.findOne({ ownerId: ownerIdOf(req) }).lean();
    res.json({ profile: doc ? profileSchema.parse(doc.data) : null, updatedAt: doc?.updatedAt ?? null });
  });

  router.put('/profile', async (req, res) => {
    const data = profileSchema.parse(req.body);
    const doc = await MasterProfile.findOneAndUpdate(
      { ownerId: ownerIdOf(req) },
      { $set: { data } },
      { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
    ).lean();
    res.json({ profile: data, updatedAt: doc?.updatedAt ?? null });
  });

  router.delete('/profile', async (req, res) => {
    await MasterProfile.deleteOne({ ownerId: ownerIdOf(req) });
    res.status(204).end();
  });

  // ---------- tailoring (never writes to the database) ----------

  router.post('/tailor', aiLimiter, async (req, res) => {
    const job = jobSchema.parse(req.body);
    const ownerId = ownerIdOf(req);
    const [profile, layout] = await Promise.all([loadProfile(ownerId), loadLayout(ownerId)]);
    res.json({ job, ...(await tailorCv(config, profile, job, layout)) });
  });

  router.post('/tailor/refine', aiLimiter, async (req, res) => {
    const { job, content, instruction } = refineRequestSchema.parse(req.body);
    const profile = await loadProfile(ownerIdOf(req));
    res.json({ job, ...(await refineCv(config, profile, job, content, instruction)) });
  });

  router.post('/tailor/restyle', aiLimiter, uploadWithPayload.single('file'), async (req, res) => {
    if (!req.file) throw badRequest('Attach a sample CV (PDF or DOCX).');
    let payload: unknown;
    try {
      payload = JSON.parse(String((req.body as { payload?: unknown } | undefined)?.payload ?? ''));
    } catch {
      throw badRequest('The CV to restyle was missing from the request.');
    }
    const { job, content, analysis } = restyleRequestSchema.parse(payload);
    const kind = detectKind(req.file.buffer, req.file.originalname);
    // The sample is read in memory for this request only and never stored.
    const sampleText = await extractText(req.file.buffer, kind);
    const profile = await loadProfile(ownerIdOf(req));
    res.json({ job, ...(await restyleCv(config, profile, job, content, analysis, sampleText)) });
  });

  router.post('/tailor/summary', aiLimiter, async (req, res) => {
    const { job, currentSummary } = regenerateSummarySchema.parse(req.body);
    const profile = await loadProfile(ownerIdOf(req));
    res.json(await regenerateSummary(config, profile, job, currentSummary));
  });

  // ---------- saved versions ----------

  router.get('/dashboard', async (req, res) => {
    const ownerId = ownerIdOf(req);
    const [profileDoc, totalVersions, recent] = await Promise.all([
      MasterProfile.findOne({ ownerId }).lean(),
      TailoredCv.countDocuments({ ownerId }),
      TailoredCv.find({ ownerId }).sort({ createdAt: -1 }).limit(3).select('job.title job.company job.emphasis generatedBy analysis.score createdAt').lean(),
    ]);
    const profile = profileDoc ? profileSchema.parse(profileDoc.data) : null;
    res.json({
      profile: profile
        ? {
            exists: true,
            usable: profileIsUsable(profile),
            fullName: profile.contact.fullName,
            updatedAt: profileDoc?.updatedAt ?? null,
            counts: {
              experience: profile.experience.length,
              skills: profile.skills.technical.length + profile.skills.soft.length,
              education: profile.education.length,
              projects: profile.projects.length,
            },
          }
        : { exists: false, usable: false },
      totalVersions,
      recent: recent.map(summarise),
    });
  });

  router.get('/versions', async (req, res) => {
    const versions = await TailoredCv.find({ ownerId: ownerIdOf(req) })
      .sort({ createdAt: -1 })
      .limit(200)
      .select('job.title job.company job.emphasis generatedBy analysis.score createdAt updatedAt')
      .lean();
    res.json({ versions: versions.map(summarise) });
  });

  router.post('/versions', async (req, res) => {
    const input = versionInputSchema.parse(req.body);
    const doc = await TailoredCv.create({ ...input, ownerId: ownerIdOf(req) });
    res.status(201).json({ version: full(doc.toObject()) });
  });

  router.get('/versions/:id', async (req, res) => {
    const doc = await TailoredCv.findOne({ _id: versionId(req), ownerId: ownerIdOf(req) }).lean();
    if (!doc) throw notFound('That CV version was not found.');
    res.json({ version: full(doc) });
  });

  router.put('/versions/:id', async (req, res) => {
    const input = versionInputSchema.parse(req.body);
    const doc = await TailoredCv.findOneAndUpdate(
      { _id: versionId(req), ownerId: ownerIdOf(req) },
      { $set: input },
      { returnDocument: 'after', runValidators: true },
    ).lean();
    if (!doc) throw notFound('That CV version was not found.');
    res.json({ version: full(doc) });
  });

  router.delete('/versions/:id', async (req, res) => {
    const result = await TailoredCv.deleteOne({ _id: versionId(req), ownerId: ownerIdOf(req) });
    if (result.deletedCount === 0) throw notFound('That CV version was not found.');
    res.status(204).end();
  });

  /** Erase everything stored for the owner: master profile and every saved CV version. */
  router.delete('/data', async (req, res) => {
    const ownerId = ownerIdOf(req);
    const [versions] = await Promise.all([
      TailoredCv.deleteMany({ ownerId }),
      MasterProfile.deleteOne({ ownerId }),
      User.updateOne({ _id: ownerId }, { $unset: { layout: 1 } }),
    ]);
    res.json({ deletedVersions: versions.deletedCount });
  });

  return router;
}

type LeanVersion = {
  _id: unknown;
  job: { title: string; company?: string; emphasis?: string; description?: string; url?: string };
  generatedBy: string;
  analysis?: { score?: number };
  createdAt: Date;
  updatedAt?: Date;
};

function summarise(doc: LeanVersion) {
  return {
    id: String(doc._id),
    jobTitle: doc.job.title,
    company: doc.job.company ?? '',
    emphasis: doc.job.emphasis ?? '',
    score: typeof doc.analysis?.score === 'number' ? Math.round(doc.analysis.score) : undefined,
    generatedBy: doc.generatedBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt ?? doc.createdAt,
  };
}

function full(doc: LeanVersion & { content: unknown; analysis: unknown; aiModel?: string }) {
  return {
    id: String(doc._id),
    job: doc.job,
    content: doc.content,
    analysis: doc.analysis,
    generatedBy: doc.generatedBy,
    aiModel: doc.aiModel ?? '',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt ?? doc.createdAt,
  };
}
