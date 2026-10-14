// Mirrors the server's zod schemas (server/src/schemas.ts).

export interface Contact {
  fullName: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  portfolio: string;
}

export interface Skills {
  technical: string[];
  soft: string[];
}

export interface Experience {
  id: string;
  title: string;
  organization: string;
  location: string;
  startDate: string;
  endDate: string;
  responsibilities: string[];
  achievements: string[];
}

export interface Education {
  id: string;
  qualification: string;
  institution: string;
  location: string;
  startDate: string;
  endDate: string;
  details: string;
}

export interface Certification {
  id: string;
  name: string;
  issuer: string;
  date: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  technologies: string[];
  link: string;
}

export interface Volunteer {
  id: string;
  role: string;
  organization: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface Language {
  id: string;
  name: string;
  proficiency: string;
}

export interface Profile {
  contact: Contact;
  summary: string;
  experience: Experience[];
  skills: Skills;
  education: Education[];
  certifications: Certification[];
  projects: Project[];
  volunteer: Volunteer[];
  languages: Language[];
}

/** Suggestions for the industry or field; any text is accepted. */
export const EMPHASES = [
  'General',
  'Accounting & Finance',
  'Administration & Office',
  'Agriculture',
  'Banking & Fintech',
  'Construction & Trades',
  'Creative, Media & Design',
  'Customer Service',
  'Data & Analytics',
  'Education & Teaching',
  'Engineering',
  'Government & Public Sector',
  'Healthcare & Nursing',
  'Hospitality & Tourism',
  'Human Resources',
  'Information Technology',
  'Legal',
  'Logistics & Supply Chain',
  'Manufacturing',
  'Marketing & Communications',
  'NGO & Development',
  'Retail',
  'Sales & Business Development',
  'Science & Research',
  'Security',
  'Software Development',
];
export type Emphasis = string;

export interface Job {
  title: string;
  company: string;
  description: string;
  url: string;
  emphasis: Emphasis;
  /** Your own guidance to the AI for this CV. */
  instructions: string;
}

export interface CvExperience {
  id: string;
  title: string;
  organization: string;
  location: string;
  startDate: string;
  endDate: string;
  bullets: string[];
}

export const SECTION_KEYS = ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'volunteer', 'languages'] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

/** What each section holds, whatever heading it is given. */
export const SECTION_NAMES: Record<SectionKey, string> = {
  summary: 'Summary',
  skills: 'Skills',
  experience: 'Experience',
  projects: 'Projects',
  education: 'Education',
  certifications: 'Certifications',
  volunteer: 'Volunteer experience',
  languages: 'Languages',
};

export interface LayoutSection {
  key: SectionKey;
  title: string;
  hidden: boolean;
}

/** Section order and heading names of a CV. */
export interface Layout {
  sections: LayoutSection[];
}

export interface LayoutResult {
  layout: Layout;
  found: number;
  method: 'ai' | 'basic';
}

export interface CvContent {
  contact: Contact;
  summary: string;
  skills: Skills;
  experience: CvExperience[];
  projects: Project[];
  education: Education[];
  certifications: Certification[];
  volunteer: Volunteer[];
  languages: Language[];
  layout: Layout;
  /** Visual design of the PDF; absent on older CVs, meaning "professional". */
  design?: Design;
}

export interface Requirement {
  requirement: string;
  importance: 'essential' | 'desirable';
  status: 'met' | 'partial' | 'missing';
  /** Where the CV shows it, or what related experience earns partial credit. */
  evidence: string;
}

export interface Analysis {
  score: number;
  /** Absent on CVs saved before the checklist existed. */
  requirements?: Requirement[];
  matchedSkills: string[];
  missingSkills: string[];
  relevantExperience: string[];
  keywordsIncluded: string[];
  suggestions: string[];
  flags: string[];
}

export type Generator = 'ai' | 'demo';

export interface TailorResult {
  job: Job;
  content: CvContent;
  analysis: Analysis;
  generatedBy: Generator;
  aiModel: string;
}

export interface Version extends TailorResult {
  id: string;
  coverLetter: string;
  interviewPrep: InterviewPrep | null;
  application: Application;
  share: { token: string; enabled: boolean } | null;
  createdAt: string;
  updatedAt: string;
}

export interface VersionSummary {
  id: string;
  score?: number;
  status: ApplicationStatus;
  appliedAt: string;
  jobTitle: string;
  company: string;
  emphasis: string;
  generatedBy: Generator;
  createdAt: string;
  updatedAt: string;
}

export interface Status {
  aiConfigured: boolean;
  aiModel: string;
  dbPersistent: boolean;
  maxUploadMb: number;
  role: 'admin' | 'member';
  /** limit 0 means unlimited */
  aiUsage: { used: number; limit: number };
}

export interface Dashboard {
  profile: {
    exists: boolean;
    usable: boolean;
    fullName?: string;
    updatedAt?: string | null;
    counts?: { experience: number; skills: number; education: number; projects: number };
  };
  totalVersions: number;
  pipeline: Partial<Record<ApplicationStatus, number>>;
  recent: VersionSummary[];
}

export interface ExtractResult {
  profile: Profile;
  method: 'ai' | 'basic';
  warnings: string[];
}

/** The CV currently open in the editor. `id` is set once it has been saved as a version. */
export interface ChatMessage {
  from: 'you' | 'ai';
  text: string;
}

export interface RefineResult extends TailorResult {
  /** Present when a pasted job description replaced the job. */
  job: Job;
  reply: string;
  newSkills: string[];
}

export interface Draft extends TailorResult {
  id?: string;
  /** This session's instructions to the AI and its replies. Not stored with the version. */
  chat?: ChatMessage[];
  /** True when there are edits that have not been saved to the version history. */
  dirty: boolean;
  /** Just generated and not yet seen: show the "ready" moment. */
  fresh?: boolean;
  coverLetter?: string;
  interviewPrep?: InterviewPrep | null;
  application?: Application;
  share?: { token: string; enabled: boolean } | null;
}

export const defaultLayout = (): Layout => ({
  sections: [
    { key: 'summary', title: 'Professional Summary', hidden: false },
    { key: 'skills', title: 'Skills', hidden: false },
    { key: 'experience', title: 'Professional Experience', hidden: false },
    { key: 'projects', title: 'Projects', hidden: false },
    { key: 'education', title: 'Education', hidden: false },
    { key: 'certifications', title: 'Certifications & Training', hidden: false },
    { key: 'volunteer', title: 'Volunteer Experience', hidden: false },
    { key: 'languages', title: 'Languages', hidden: false },
  ],
});

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const emptyProfile = (): Profile => ({
  contact: { fullName: '', headline: '', email: '', phone: '', location: '', linkedin: '', github: '', portfolio: '' },
  summary: '',
  experience: [],
  skills: { technical: [], soft: [] },
  education: [],
  certifications: [],
  projects: [],
  volunteer: [],
  languages: [],
});

// ---------- PDF designs ----------

export type Design = 'professional' | 'modern' | 'classic' | 'compact';
export const DESIGN_OPTIONS: { id: Design; name: string; hint: string }[] = [
  { id: 'professional', name: 'Professional', hint: 'Clean and balanced' },
  { id: 'modern', name: 'Modern', hint: 'Coloured header band' },
  { id: 'classic', name: 'Classic', hint: 'Serif, centred, traditional' },
  { id: 'compact', name: 'Compact', hint: 'Fits more on one page' },
];

// ---------- application tracker ----------

export type ApplicationStatus = 'not_applied' | 'applied' | 'interview' | 'offer' | 'rejected' | 'withdrawn';
export const STATUS_OPTIONS: { id: ApplicationStatus; label: string; tone: string }[] = [
  { id: 'not_applied', label: 'Not applied', tone: 'bg-slate-100 text-slate-700' },
  { id: 'applied', label: 'Applied', tone: 'bg-sky-100 text-sky-800' },
  { id: 'interview', label: 'Interview', tone: 'bg-violet-100 text-violet-800' },
  { id: 'offer', label: 'Offer', tone: 'bg-emerald-100 text-emerald-800' },
  { id: 'rejected', label: 'Rejected', tone: 'bg-rose-100 text-rose-700' },
  { id: 'withdrawn', label: 'Withdrawn', tone: 'bg-slate-200 text-slate-600' },
];
export const statusOption = (id: string | undefined) => STATUS_OPTIONS.find((s) => s.id === id) ?? STATUS_OPTIONS[0]!;

export interface Application {
  status: ApplicationStatus;
  appliedAt: string;
  notes: string;
}

// ---------- documents ----------

export interface InterviewPrep {
  questions: { question: string; category: string; why: string; answer: string }[];
  gaps: { gap: string; advice: string }[];
  questionsToAsk: string[];
}

export interface LinkedinProfile {
  headline: string;
  about: string;
  skills: string[];
}

export type LetterTone = 'professional' | 'warm' | 'confident' | 'concise';

// ---------- accounts ----------

export interface Account {
  name: string;
  email: string;
  role: 'admin' | 'member';
  createdAt: string;
}

export interface Invite {
  id: string;
  code: string;
  note: string;
  maxUses: number;
  uses: number;
  revoked: boolean;
  createdAt: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  disabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  savedCvs: number;
  aiToday: number;
}

export interface SharedCv {
  content: CvContent;
  jobTitle: string;
  updatedAt: string;
}
