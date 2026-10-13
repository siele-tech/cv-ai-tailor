import { describe, expect, it } from 'vitest';
import { extractText as readPdf, getDocumentProxy } from 'unpdf';
import { HttpError } from '../src/errors.js';
import { detectKind, extractText } from '../src/services/extractText.js';
import { parseCvHeuristically } from '../src/services/heuristicParser.js';
import { normalizeProfile } from '../src/services/normalizeProfile.js';
import { cvFilename, pdfSafe, renderCvPdf } from '../src/services/pdf.js';
import { CV_LINES, makeDocx, sampleContent } from './helpers.js';

async function pdfInfo(buffer: Buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text, totalPages } = await readPdf(pdf, { mergePages: true });
  return { text: text.replace(/\s+/g, ' '), totalPages };
}

const status = async (fn: () => unknown) => {
  try {
    await fn();
  } catch (err) {
    return err instanceof HttpError ? err.status : -1;
  }
  return 0;
};

describe('PDF generation', () => {
  it('renders a short CV as one page of selectable text', async () => {
    const content = sampleContent();
    const buffer = await renderCvPdf(content);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    const { text, totalPages } = await pdfInfo(buffer);
    expect(totalPages).toBe(1);
    expect(text).toContain('Sample Candidate');
    expect(text).toContain('PROFESSIONAL EXPERIENCE');
    expect(text).toContain('Example Fintech Ltd');
    expect(text).toContain('Reduced average API response time by 35%');
    expect(text).toContain('BSc Computer Science');
    expect(text).not.toContain('Page 1 of');
  });

  it('flows a long CV over several pages without losing content', async () => {
    const content = sampleContent();
    const base = content.experience[0]!;
    content.experience = Array.from({ length: 14 }, (_, i) => ({
      ...base,
      id: `exp-${i}`,
      organization: `Employer Number ${i + 1}`,
      bullets: Array.from({ length: 6 }, (_, b) => `Role ${i + 1} bullet ${b + 1}: delivered a clearly described piece of work that is long enough to wrap onto a second line of the page.`),
    }));
    const { text, totalPages } = await pdfInfo(await renderCvPdf(content));
    expect(totalPages).toBeGreaterThan(2);
    for (let i = 1; i <= 14; i++) {
      expect(text).toContain(`Employer Number ${i}`);
      expect(text).toContain(`Role ${i} bullet 6:`);
    }
    expect(text).toContain(`Page ${totalPages} of ${totalPages}`);
    expect(text).toContain('BSc Computer Science');
  });

  it('renders the content it is given, including edits and unusual characters', async () => {
    const content = sampleContent();
    content.summary = 'Edited summary — “quoted”, naïve café, Łódź \u2192 done.';
    const { text } = await pdfInfo(await renderCvPdf(content));
    expect(text).toContain('Edited summary');
    expect(text).toContain('naïve café');
    expect(text).toContain('Lódz -> done');
  });

  it('survives an almost empty CV', async () => {
    const buffer = await renderCvPdf(normalizeCv());
    expect((await pdfInfo(buffer)).totalPages).toBe(1);
  });

  it('transliterates characters the fonts cannot draw', () => {
    expect(pdfSafe('a\u200bb \u2192 c \u2713 日本')).toBe('ab -> c - ??');
  });

  it('builds safe filenames', () => {
    expect(cvFilename('Acme Bank', 'Senior Engineer')).toBe('Acme_Bank_Senior_Engineer_Tailored_CV.pdf');
    expect(cvFilename('../../etc/passwd', 'C++ / "Dev" <script>')).toBe('etc_passwd_C_Dev_script_Tailored_CV.pdf');
    expect(cvFilename('', '')).toBe('Tailored_CV.pdf');
    expect(cvFilename('Société Générale', 'Ingénieur')).toBe('Societe_Generale_Ingenieur_Tailored_CV.pdf');
  });
});

function normalizeCv() {
  const content = sampleContent();
  return { ...content, summary: '', skills: { technical: [], soft: [] }, experience: [], projects: [], education: [], certifications: [], languages: [] };
}

describe('document text extraction', () => {
  it('extracts text from a PDF', async () => {
    const buffer = await renderCvPdf(sampleContent());
    expect(detectKind(buffer, 'My CV.PDF')).toBe('pdf');
    const text = await extractText(buffer, 'pdf');
    expect(text).toContain('Sample Candidate');
    expect(text).toContain('Example Fintech Ltd');
  });

  it('extracts text from a DOCX', async () => {
    const buffer = await makeDocx(CV_LINES);
    expect(detectKind(buffer, 'cv.docx')).toBe('docx');
    const text = await extractText(buffer, 'docx');
    expect(text).toContain('Jordan Example');
    expect(text).toContain('Reduced API response time by 35%');
  });

  it('rejects unsupported extensions', async () => {
    expect(await status(() => detectKind(Buffer.from('hello'), 'cv.txt'))).toBe(415);
    expect(await status(() => detectKind(Buffer.from('MZ\u0090'), 'cv.exe'))).toBe(415);
    expect(await status(() => detectKind(Buffer.from('hello'), 'cv.doc'))).toBe(415);
  });

  it('rejects files whose content does not match the extension', async () => {
    expect(await status(() => detectKind(Buffer.from('this is not a pdf at all'), 'cv.pdf'))).toBe(415);
    expect(await status(() => detectKind(Buffer.from('%PDF-1.7 fake'), 'cv.docx'))).toBe(415);
    expect(await status(() => detectKind(Buffer.alloc(0), 'cv.pdf'))).toBe(400);
  });

  it('reports corrupted documents instead of crashing', async () => {
    expect(await status(() => extractText(Buffer.from('%PDF-1.7\nthis is garbage, not a real pdf body'), 'pdf'))).toBe(422);
    expect(await status(() => extractText(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5]), 'docx'))).toBe(422);
  });

  it('reports documents with no text', async () => {
    expect(await status(async () => extractText(await makeDocx(['']), 'docx'))).toBe(422);
  });
});

describe('basic (no-AI) CV parser', () => {
  const { profile } = parseCvHeuristically(CV_LINES.join('\n'));

  it('finds contact details', () => {
    expect(profile.contact).toMatchObject({
      fullName: 'Jordan Example',
      headline: 'Software Developer',
      email: 'jordan@example.com',
      linkedin: 'linkedin.com/in/jordan-example',
    });
    expect(profile.contact.phone).toContain('111 222 3333');
  });

  it('splits experience into roles with dates and bullets', () => {
    expect(profile.experience).toHaveLength(2);
    expect(profile.experience[0]).toMatchObject({
      title: 'Software Developer',
      organization: 'Example Fintech Ltd',
      startDate: 'Mar 2022',
      endDate: 'Present',
    });
    expect(profile.experience[0]!.responsibilities).toHaveLength(2);
    expect(profile.experience[1]!.organization).toBe('Demo Agency');
  });

  it('reads the other sections', () => {
    expect(profile.summary).toBe('Developer focused on payment systems and web APIs.');
    expect(profile.skills.technical).toEqual(['TypeScript', 'Node.js', 'MongoDB', 'PostgreSQL']);
    expect(profile.skills.soft).toEqual(['Communication', 'Teamwork']);
    expect(profile.education[0]).toMatchObject({ qualification: 'BSc Computer Science', institution: 'Example University', endDate: '2020' });
    expect(profile.languages).toMatchObject([{ name: 'English', proficiency: 'Fluent' }, { name: 'French', proficiency: 'Basic' }]);
  });

  it('warns when nothing is recognisable', () => {
    const result = parseCvHeuristically('just some words\nwith no structure whatsoever');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.profile.experience).toEqual([]);
  });
});

describe('normalizeProfile', () => {
  it('tolerates wrong types and over-long values from a model', () => {
    const profile = normalizeProfile({
      contact: { fullName: 42, email: null },
      summary: ['not', 'a', 'string'],
      experience: [{ title: 'Dev', startDate: 'x'.repeat(200), responsibilities: '- one\n- two' }, 'junk', {}],
      skills: { technical: ['A', 7, null, ''], soft: 'Teamwork; Communication' },
      certifications: ['Cert One', { name: '' }],
      languages: 'nope',
    });
    expect(profile.contact.fullName).toBe('42');
    expect(profile.summary).toBe('');
    expect(profile.experience).toHaveLength(1);
    expect(profile.experience[0]!.startDate).toHaveLength(40);
    expect(profile.experience[0]!.responsibilities).toEqual(['one', 'two']);
    expect(profile.skills).toEqual({ technical: ['A', '7'], soft: ['Teamwork', 'Communication'] });
    expect(profile.certifications.map((c) => c.name)).toEqual(['Cert One']);
    expect(profile.languages).toEqual([]);
  });
});
