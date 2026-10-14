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
}

export interface Analysis {
  score: number;
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
  createdAt: string;
  updatedAt: string;
}

export interface VersionSummary {
  id: string;
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
