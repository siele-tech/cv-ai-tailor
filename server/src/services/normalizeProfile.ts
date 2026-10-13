import { profileSchema, type Profile } from '../schemas.js';

// Tolerant conversion of untrusted, loosely-shaped data (model output, heuristic parser output)
// into a valid Profile: wrong types are dropped and over-long values are truncated rather
// than failing the whole extraction.

type Rec = Record<string, unknown>;

const rec = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function str(v: unknown, max: number): string {
  if (typeof v === 'number') return String(v);
  if (typeof v !== 'string') return '';
  return v.replace(/\s+/g, ' ').trim().slice(0, max);
}

function strs(v: unknown, maxItems: number, maxLen: number): string[] {
  const items = typeof v === 'string' ? v.split(/\n|;/) : arr(v);
  return items
    .map((item) => str(item, maxLen).replace(/^[\s•\u25cf\u25aa\u25e6·*\-–]+/, ''))
    .filter(Boolean)
    .slice(0, maxItems);
}

const hasAny = (o: Rec) => Object.values(o).some((v) => (Array.isArray(v) ? v.length > 0 : Boolean(v)));

export function normalizeProfile(input: unknown): Profile {
  const raw = rec(input);
  const contact = rec(raw.contact);
  const skills = rec(raw.skills);

  return profileSchema.parse({
    contact: {
      fullName: str(contact.fullName, 120),
      headline: str(contact.headline, 160),
      email: str(contact.email, 160),
      phone: str(contact.phone, 60),
      location: str(contact.location, 160),
      linkedin: str(contact.linkedin, 300),
      github: str(contact.github, 300),
      portfolio: str(contact.portfolio, 300),
    },
    summary: typeof raw.summary === 'string' ? raw.summary.trim().slice(0, 3000) : '',
    experience: arr(raw.experience)
      .map(rec)
      .map((e) => ({
        title: str(e.title, 160),
        organization: str(e.organization, 160),
        location: str(e.location, 160),
        startDate: str(e.startDate, 40),
        endDate: str(e.endDate, 40),
        responsibilities: strs(e.responsibilities, 40, 600),
        achievements: strs(e.achievements, 40, 600),
      }))
      .filter(hasAny)
      .slice(0, 40),
    skills: {
      technical: strs(skills.technical, 120, 80),
      soft: strs(skills.soft, 60, 80),
    },
    education: arr(raw.education)
      .map(rec)
      .map((e) => ({
        qualification: str(e.qualification, 200),
        institution: str(e.institution, 200),
        location: str(e.location, 160),
        startDate: str(e.startDate, 40),
        endDate: str(e.endDate, 40),
        details: str(e.details, 600),
      }))
      .filter(hasAny)
      .slice(0, 20),
    certifications: arr(raw.certifications)
      .map((c) => (typeof c === 'string' ? { name: c } : rec(c)))
      .map((c) => ({ name: str(c.name, 200), issuer: str(c.issuer, 200), date: str(c.date, 40) }))
      .filter((c) => c.name)
      .slice(0, 60),
    projects: arr(raw.projects)
      .map(rec)
      .map((p) => ({
        name: str(p.name, 200),
        description: str(p.description, 1500),
        technologies: strs(p.technologies, 40, 80),
        link: str(p.link, 300),
      }))
      .filter(hasAny)
      .slice(0, 40),
    volunteer: arr(raw.volunteer)
      .map(rec)
      .map((v) => ({
        role: str(v.role, 160),
        organization: str(v.organization, 160),
        startDate: str(v.startDate, 40),
        endDate: str(v.endDate, 40),
        description: str(v.description, 1000),
      }))
      .filter(hasAny)
      .slice(0, 20),
    languages: arr(raw.languages)
      .map((l) => (typeof l === 'string' ? { name: l } : rec(l)))
      .map((l) => ({ name: str(l.name, 80), proficiency: str(l.proficiency, 80) }))
      .filter((l) => l.name)
      .slice(0, 20),
  });
}

/** True when the profile holds enough to tailor from. */
export function profileIsUsable(profile: Profile): boolean {
  return (
    profile.experience.length > 0 ||
    profile.projects.length > 0 ||
    profile.education.length > 0 ||
    profile.skills.technical.length > 0
  );
}
