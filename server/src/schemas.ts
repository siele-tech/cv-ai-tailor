import { randomUUID } from 'node:crypto';
import { z } from 'zod';

// ---------- primitives ----------

const text = (max: number) => z.string().trim().max(max).default('');

/** A list of non-empty strings. Blank entries are dropped rather than rejected. */
const list = (maxItems: number, maxLen: number) =>
  z
    .array(z.string().trim().max(maxLen))
    .max(maxItems)
    .default([])
    .transform((items) => items.filter((s) => s.length > 0));

const itemId = z
  .string()
  .trim()
  .max(64)
  .default('')
  .transform((id) => id || randomUUID());

// ---------- master profile ----------

export const contactSchema = z.object({
  fullName: text(120),
  headline: text(160),
  email: text(160),
  phone: text(60),
  location: text(160),
  linkedin: text(300),
  github: text(300),
  portfolio: text(300),
});

export const experienceSchema = z.object({
  id: itemId,
  title: text(160),
  organization: text(160),
  location: text(160),
  startDate: text(40),
  endDate: text(40),
  responsibilities: list(40, 600),
  achievements: list(40, 600),
});

export const educationSchema = z.object({
  id: itemId,
  qualification: text(200),
  institution: text(200),
  location: text(160),
  startDate: text(40),
  endDate: text(40),
  details: text(600),
});

export const certificationSchema = z.object({
  id: itemId,
  name: text(200),
  issuer: text(200),
  date: text(40),
});

export const projectSchema = z.object({
  id: itemId,
  name: text(200),
  description: text(1500),
  technologies: list(40, 80),
  link: text(300),
});

export const volunteerSchema = z.object({
  id: itemId,
  role: text(160),
  organization: text(160),
  startDate: text(40),
  endDate: text(40),
  description: text(1000),
});

export const languageSchema = z.object({
  id: itemId,
  name: text(80),
  proficiency: text(80),
});

const skillsSchema = z.object({
  technical: list(120, 80),
  soft: list(60, 80),
});

const emptyContact = () => contactSchema.parse({});
const emptySkills = () => skillsSchema.parse({});

export const profileSchema = z.object({
  contact: contactSchema.default(emptyContact),
  summary: text(3000),
  experience: z.array(experienceSchema).max(40).default([]),
  skills: skillsSchema.default(emptySkills),
  education: z.array(educationSchema).max(20).default([]),
  certifications: z.array(certificationSchema).max(60).default([]),
  projects: z.array(projectSchema).max(40).default([]),
  volunteer: z.array(volunteerSchema).max(20).default([]),
  languages: z.array(languageSchema).max(20).default([]),
});
export type Profile = z.infer<typeof profileSchema>;
export type Experience = z.infer<typeof experienceSchema>;
export type Project = z.infer<typeof projectSchema>;

// ---------- job + tailored CV ----------

export const EMPHASES = [
  'General IT',
  'Software Development',
  'Full-Stack Development',
  'Data Analysis',
  'Fintech',
  'AI/ML',
  'DevOps',
] as const;

export const jobSchema = z.object({
  title: z.string().trim().min(1, 'Job title is required').max(160),
  company: text(160),
  description: z
    .string()
    .trim()
    .min(40, 'Paste the job description (at least 40 characters)')
    .max(20_000, 'Job description is too long (20,000 characters max)'),
  url: text(600),
  emphasis: z.enum(EMPHASES).default('General IT'),
});
export type Job = z.infer<typeof jobSchema>;

export const cvExperienceSchema = z.object({
  id: itemId,
  title: text(160),
  organization: text(160),
  location: text(160),
  startDate: text(40),
  endDate: text(40),
  bullets: list(20, 600),
});

export const cvProjectSchema = z.object({
  id: itemId,
  name: text(200),
  description: text(1500),
  technologies: list(40, 80),
  link: text(300),
});

export const cvContentSchema = z.object({
  contact: contactSchema.default(emptyContact),
  summary: text(3000),
  skills: skillsSchema.default(emptySkills),
  experience: z.array(cvExperienceSchema).max(40).default([]),
  projects: z.array(cvProjectSchema).max(40).default([]),
  education: z.array(educationSchema).max(20).default([]),
  certifications: z.array(certificationSchema).max(60).default([]),
  volunteer: z.array(volunteerSchema).max(20).default([]),
  languages: z.array(languageSchema).max(20).default([]),
});
export type CvContent = z.infer<typeof cvContentSchema>;

export const analysisSchema = z.object({
  score: z.number().min(0).max(100).default(0),
  matchedSkills: list(80, 120),
  missingSkills: list(80, 120),
  relevantExperience: list(40, 400),
  keywordsIncluded: list(80, 120),
  suggestions: list(40, 600),
  /** Things the generator could not verify or had to leave out; shown to the user. */
  flags: list(60, 600),
});
export type Analysis = z.infer<typeof analysisSchema>;

const emptyAnalysis = () => analysisSchema.parse({});

export const GENERATORS = ['ai', 'demo'] as const;

export const versionInputSchema = z.object({
  job: jobSchema,
  content: cvContentSchema,
  analysis: analysisSchema.default(emptyAnalysis),
  generatedBy: z.enum(GENERATORS).default('demo'),
  aiModel: text(120),
});
export type VersionInput = z.infer<typeof versionInputSchema>;

export const pdfRequestSchema = z.object({
  content: cvContentSchema,
  jobTitle: text(160),
  company: text(160),
});

export const regenerateSummarySchema = z.object({
  job: jobSchema,
  currentSummary: text(3000),
});

export const loginSchema = z.object({
  password: z.string().min(1).max(200),
});

// ---------- what we ask the model for ----------
// Kept deliberately small: the model chooses, orders and rephrases. Facts (names, dates,
// employers, qualifications) are re-attached from the master profile by the server.

const looseList = z
  .array(z.unknown())
  .default([])
  .transform((items) =>
    items
      .filter((s): s is string => typeof s === 'string')
      .map((s) => s.trim().slice(0, 600))
      .filter(Boolean)
      .slice(0, 80),
  );
const looseText = z
  .unknown()
  .transform((v) => (typeof v === 'string' ? v.trim() : ''));

export const aiTailorSchema = z.object({
  summary: z.string().trim().min(1),
  skills: z.object({ technical: looseList, soft: looseList }),
  experience: z
    .array(z.object({ sourceId: z.string(), bullets: looseList }))
    .min(0)
    .max(40),
  projects: z
    .array(z.object({ sourceId: z.string(), description: looseText, technologies: looseList }))
    .max(40)
    .default([]),
  analysis: z.object({
    score: z.coerce.number().min(0).max(100),
    matchedSkills: looseList,
    missingSkills: looseList,
    relevantExperience: looseList,
    keywordsIncluded: looseList,
    suggestions: looseList,
    missingInformation: looseList,
  }),
});
export type AiTailorOutput = z.infer<typeof aiTailorSchema>;

export const aiSummarySchema = z.object({ summary: z.string().trim().min(1).max(3000) });

/** Zod issues flattened to short, user-presentable strings. */
export function describeIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 8).map((issue) => {
    const where = issue.path.join('.');
    return where ? `${where}: ${issue.message}` : issue.message;
  });
}
