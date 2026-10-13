import type { Profile } from '../schemas.js';
import { normalizeProfile } from './normalizeProfile.js';

// Rule-based CV parsing used when no AI key is configured. It is intentionally modest:
// it recognises common section headings, contact details and date ranges, and leaves the
// rest for the user to correct on the review screen.

type SectionKey =
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'certifications'
  | 'projects'
  | 'volunteer'
  | 'languages'
  | 'ignored';

const HEADINGS: [SectionKey, RegExp][] = [
  ['summary', /^((professional|career|personal|executive)\s+)?(summary|profile|objective|about(\s+me)?)$/],
  ['experience', /^((work|professional|employment|relevant|career)\s+)?(experience|history|employment)(\s+history)?$/],
  ['education', /^(education|academic\s+(background|qualifications)|qualifications)(\s+(&|and)\s+\w+)?$/],
  ['skills', /^((technical|key|core|professional|soft|relevant)\s+)?(skills|competenc(ies|es)|technologies|tech\s+stack)(\s+(&|and)\s+[\w\s]+)?$/],
  ['certifications', /^(certifications?|certificates?|licen[cs]es?|training|courses)(\s+(&|and)\s+[\w\s]+)?$/],
  ['projects', /^((key|selected|personal|notable|academic|side)\s+)?projects$/],
  ['volunteer', /^(volunteer(ing)?|community)(\s+(experience|work|service))?$/],
  ['languages', /^languages(\s+spoken)?$/],
  ['ignored', /^(references?|referees?|interests|hobbies(\s+(&|and)\s+interests)?|awards|publications)$/],
];

const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
const POINT = `(?:(?:${MONTH}\\s+)?(?:19|20)\\d{2}|\\d{1,2}/(?:19|20)\\d{2})`;
const DATE_RANGE = new RegExp(`(${POINT})\\s*(?:-|–|—|to|until)\\s*(${POINT}|present|current|now|date|ongoing)`, 'i');
const YEAR = /\b(?:19|20)\d{2}\b/;
const BULLET = /^\s*(?:[•\u25cf\u25aa\u25e6·*➢►\u2713]|-|–|o\s)\s*/;

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const PHONE = /(?:\+|\b)\d[\d\s().-]{7,17}\d\b/;
const URL = /(?:https?:\/\/|www\.)[^\s|,;]+|\b(?:linkedin\.com|github\.com)\/[^\s|,;]+/gi;

const SOFT_WORDS = /communicat|leadership|teamwork|team\s?player|collaborat|problem[- ]solving|adaptab|time management|critical thinking|mentor|interpersonal|presentation|negotiat|stakeholder|creativ|attention to detail|organi[sz]ation/i;
const DEGREE = /\b(bachelor|master|b\.?\s?sc|m\.?\s?sc|b\.?\s?a\b|m\.?\s?a\b|b\.?\s?eng|m\.?\s?eng|b\.?\s?tech|m\.?\s?tech|ph\.?\s?d|mba|diploma|degree|certificate|hnd|ond|a-levels?|high school|secondary)\b/i;

function headingOf(line: string): SectionKey | undefined {
  const cleaned = line.replace(/[:\-–—_|]+\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!cleaned || cleaned.length > 45) return undefined;
  return HEADINGS.find(([, re]) => re.test(cleaned))?.[0];
}

const stripBullet = (line: string) => line.replace(BULLET, '').trim();

/** "Title | Company" or "Title at Company" or "Title, Company" -> parts. */
function splitHeader(text: string): string[] {
  return text
    .split(/\s+\|\s+|\s+@\s+|\s+at\s+|\s+[-–—]\s+|,\s+|\t+/)
    .map((p) => p.replace(/^[\s,|–—-]+|[\s,|–—-]+$/g, ''))
    .filter(Boolean);
}

function parseExperience(lines: string[]) {
  type Entry = { title: string; organization: string; location: string; startDate: string; endDate: string; responsibilities: string[] };
  const entries: Entry[] = [];
  let current: Entry | undefined;
  let pending: string[] = [];

  const flushPending = () => {
    if (current && pending.length) {
      // Unbulleted lines that never became the next role's header belong to the current role.
      current.responsibilities.push(...pending);
    }
    pending = [];
  };

  for (const line of lines) {
    const range = DATE_RANGE.exec(line);
    if (range && !BULLET.test(line)) {
      const header = [...pending, line.replace(range[0], ' ')].flatMap(splitHeader);
      pending = [];
      current = {
        title: header[0] ?? '',
        organization: header[1] ?? '',
        location: header.slice(2).join(', '),
        startDate: range[1] ?? '',
        endDate: range[2] ?? '',
        responsibilities: [],
      };
      entries.push(current);
    } else if (BULLET.test(line)) {
      flushPending();
      if (!current) {
        current = { title: '', organization: '', location: '', startDate: '', endDate: '', responsibilities: [] };
        entries.push(current);
      }
      current.responsibilities.push(stripBullet(line));
    } else if (current && !current.organization && current.responsibilities.length === 0 && line.length < 80) {
      current.organization = line;
    } else {
      pending.push(line);
    }
  }
  if (!current && pending.length) {
    entries.push({ title: '', organization: '', location: '', startDate: '', endDate: '', responsibilities: pending });
  } else {
    flushPending();
  }
  return entries;
}

function parseEducation(lines: string[]) {
  type Entry = { qualification: string; institution: string; startDate: string; endDate: string; details: string };
  const entries: Entry[] = [];
  let current: Entry | undefined;
  for (const raw of lines) {
    let line = stripBullet(raw);
    let startDate = '';
    let endDate = '';
    const range = DATE_RANGE.exec(line);
    if (range) {
      startDate = range[1] ?? '';
      endDate = range[2] ?? '';
      line = line.replace(range[0], ' ');
    } else {
      const year = YEAR.exec(line);
      if (year) {
        endDate = year[0];
        line = line.replace(year[0], ' ');
      }
    }
    line = line.replace(/[\s,|()–—-]+$/g, '').replace(/^[\s,|()–—-]+/g, '').trim();

    if (DEGREE.test(line) || !current) {
      const parts = splitHeader(line);
      current = { qualification: parts[0] ?? line, institution: parts.slice(1).join(', '), startDate, endDate, details: '' };
      entries.push(current);
    } else {
      if (line && !current.institution) current.institution = line;
      else if (line) current.details = [current.details, line].filter(Boolean).join(' ');
      current.startDate ||= startDate;
      current.endDate ||= endDate;
    }
  }
  return entries;
}

function parseSkills(lines: string[]) {
  const technical: string[] = [];
  const soft: string[] = [];
  for (const raw of lines) {
    const line = stripBullet(raw);
    const label = /^([A-Za-z &/]{2,30}):\s*(.+)$/.exec(line);
    const softLabel = label ? /soft|interpersonal|personal/i.test(label[1] ?? '') : false;
    const body = label ? (label[2] ?? '') : line;
    for (const item of body.split(/[,;|•·]|\s{3,}/).map((s) => s.trim().replace(/\.$/, ''))) {
      if (!item || item.length > 60) continue;
      (softLabel || SOFT_WORDS.test(item) ? soft : technical).push(item);
    }
  }
  return { technical, soft };
}

function parseProjects(lines: string[]) {
  type Entry = { name: string; description: string; technologies: string[]; link: string };
  const entries: Entry[] = [];
  let current: Entry | undefined;
  for (const raw of lines) {
    const line = stripBullet(raw);
    const tech = /^(?:technologies|tech(?:\s+stack)?|tools|stack|built with)\s*(?:used)?\s*:\s*(.+)$/i.exec(line);
    if (tech && current) {
      current.technologies.push(...(tech[1] ?? '').split(/[,;|]/).map((s) => s.trim()).filter(Boolean));
    } else if (!BULLET.test(raw) && line.length < 90 && (!current || current.description)) {
      const link = line.match(URL)?.[0] ?? '';
      current = { name: line.replace(link, '').replace(/[\s|–—-]+$/, '').trim(), description: '', technologies: [], link };
      entries.push(current);
    } else if (current) {
      current.description = [current.description, line].filter(Boolean).join(' ');
    } else {
      current = { name: '', description: line, technologies: [], link: '' };
      entries.push(current);
    }
  }
  return entries;
}

function parseCertifications(lines: string[]) {
  return lines.map((raw) => {
    let line = stripBullet(raw);
    const date = new RegExp(`(?:${MONTH}\\s+)?(?:19|20)\\d{2}`, 'i').exec(line)?.[0] ?? '';
    if (date) line = line.replace(date, ' ');
    const parts = line.split(/\s+[-–—|]\s+|,\s+/).map((p) => p.replace(/[\s()]+$/g, '').trim()).filter(Boolean);
    return { name: parts[0] ?? line.trim(), issuer: parts.slice(1).join(', '), date };
  });
}

function parseLanguages(lines: string[]) {
  return lines
    .flatMap((l) => stripBullet(l).split(/[,;|•]/))
    .map((item) => {
      const m = /^(.+?)\s*(?:\(|[-–—:])\s*(.+?)\)?$/.exec(item.trim());
      return m ? { name: m[1] ?? '', proficiency: m[2] ?? '' } : { name: item.trim(), proficiency: '' };
    })
    .filter((l) => l.name);
}

function parseContact(lines: string[], allText: string) {
  const urls = allText.match(URL) ?? [];
  const linkedin = urls.find((u) => /linkedin\.com/i.test(u)) ?? '';
  const github = urls.find((u) => /github\.com/i.test(u)) ?? '';
  const portfolio = urls.find((u) => !/linkedin\.com|github\.com/i.test(u)) ?? '';
  const head = lines.join('\n');
  const email = EMAIL.exec(allText)?.[0] ?? '';
  const phone = PHONE.exec(head)?.[0] ?? '';

  const isPlain = (l: string) => !EMAIL.test(l) && !PHONE.test(l) && !/https?:|www\.|linkedin|github/i.test(l);
  const plain = lines.filter(isPlain);
  const fullName = plain.find((l) => /^[\p{L}][\p{L} .,'-]{1,60}$/u.test(l) && l.split(/\s+/).length <= 5) ?? '';
  const headline = plain.find((l) => l !== fullName && l.length <= 100 && !/\d{3,}/.test(l)) ?? '';

  return { fullName, headline, email, phone, location: '', linkedin, github, portfolio };
}

export function parseCvHeuristically(text: string): { profile: Profile; warnings: string[] } {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const sections = new Map<SectionKey | 'header', string[]>([['header', []]]);
  let active: SectionKey | 'header' = 'header';
  for (const line of lines) {
    const heading = headingOf(line);
    if (heading) {
      active = heading;
      if (!sections.has(active)) sections.set(active, []);
    } else {
      sections.get(active)?.push(line);
    }
  }
  const get = (key: SectionKey | 'header') => sections.get(key) ?? [];

  const profile = normalizeProfile({
    contact: parseContact(get('header').slice(0, 8), text),
    summary: get('summary').map(stripBullet).join(' '),
    experience: parseExperience(get('experience')),
    skills: parseSkills(get('skills')),
    education: parseEducation(get('education')),
    certifications: parseCertifications(get('certifications')),
    projects: parseProjects(get('projects')),
    volunteer: parseExperience(get('volunteer')).map((v) => ({
      role: v.title,
      organization: v.organization,
      startDate: v.startDate,
      endDate: v.endDate,
      description: v.responsibilities.join(' '),
    })),
    languages: parseLanguages(get('languages')),
  });

  const warnings: string[] = [];
  if (sections.size <= 1) {
    warnings.push('No standard section headings (Experience, Education, Skills…) were recognised, so most fields are empty.');
  }
  if (get('experience').length > 0 && profile.experience.every((e) => !e.startDate)) {
    warnings.push('Employment dates could not be recognised. Please check each role.');
  }
  return { profile, warnings };
}
