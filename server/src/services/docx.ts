import { AlignmentType, BorderStyle, Document, Packer, Paragraph, TabStopType, TextRun } from 'docx';
import type { Contact, CvContent, SectionKey } from '../schemas.js';
import { DESIGN_STYLES } from './pdf.js';

// Word versions of the CV and cover letter. Same content and section order as the PDF, built
// from real paragraphs and bullets so the file stays easy to edit and ATS-readable.

const join = (parts: string[], sep: string) => parts.map((p) => p.trim()).filter(Boolean).join(sep);
const dates = (start: string, end: string) => join([start, end], ' – ');
/** docx wants colours without the leading "#". */
const hex = (color: string) => color.replace('#', '');

interface Theme {
  font: string;
  accent: string;
  /** half-points, as Word measures font sizes */
  body: number;
  small: number;
  heading: number;
  name: number;
  centered: boolean;
}

function themeFor(content: CvContent): Theme {
  const style = DESIGN_STYLES[content.design] ?? DESIGN_STYLES.professional;
  return {
    font: style.font.regular.startsWith('Times') ? 'Times New Roman' : 'Calibri',
    accent: hex(style.accent),
    body: Math.round(style.size.body * 2 + 1),
    small: Math.round(style.size.small * 2 + 1),
    heading: Math.round(style.size.heading * 2 + 2),
    name: Math.round(style.size.name * 2 + 4),
    centered: style.header === 'centered',
  };
}

function contactBlock(contact: Contact, t: Theme): Paragraph[] {
  const alignment = t.centered ? AlignmentType.CENTER : AlignmentType.LEFT;
  const lines = [join([contact.email, contact.phone, contact.location], '  |  '), join([contact.linkedin, contact.github, contact.portfolio], '  |  ')].filter(Boolean);
  return [
    new Paragraph({ alignment, children: [new TextRun({ text: contact.fullName || 'Your Name', bold: true, size: t.name, color: t.accent, font: t.font })] }),
    ...(contact.headline ? [new Paragraph({ alignment, children: [new TextRun({ text: contact.headline, size: t.body + 2, font: t.font })] })] : []),
    ...lines.map((line) => new Paragraph({ alignment, children: [new TextRun({ text: line, size: t.small, color: '444444', font: t.font })] })),
  ];
}

export async function buildCvDocx(content: CvContent): Promise<Buffer> {
  const t = themeFor(content);
  const run = (text: string, extra: Partial<{ bold: boolean; italics: boolean; size: number; color: string }> = {}) =>
    new TextRun({ text, font: t.font, size: extra.size ?? t.body, bold: extra.bold, italics: extra.italics, color: extra.color });

  const heading = (title: string) =>
    new Paragraph({
      spacing: { before: 220, after: 80 },
      alignment: t.centered ? AlignmentType.CENTER : AlignmentType.LEFT,
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'A0A8B8', space: 2 } },
      keepNext: true,
      children: [run(title.toUpperCase(), { bold: true, size: t.heading, color: t.accent })],
    });

  /** Title on the left, dates right-aligned on the same line via a right tab stop. */
  const titleRow = (title: string, when: string) =>
    new Paragraph({
      keepNext: true,
      tabStops: [{ type: TabStopType.RIGHT, position: 9600 }],
      spacing: { before: 120 },
      children: [run(title, { bold: true }), ...(when ? [run(`\t${when}`, { size: t.small, color: '444444' })] : [])],
    });
  const sub = (text: string) => new Paragraph({ keepNext: true, children: [run(text, { italics: true, color: '444444' })] });
  const bullet = (text: string) => new Paragraph({ bullet: { level: 0 }, keepLines: true, children: [run(text)] });
  const para = (text: string, size?: number) => new Paragraph({ children: [run(text, { size })] });

  const sections: Record<SectionKey, () => Paragraph[]> = {
    summary: () => (content.summary.trim() ? [para(content.summary.trim())] : []),
    skills: () => [
      ...(content.skills.technical.length ? [new Paragraph({ children: [run('Key skills: ', { bold: true }), run(content.skills.technical.join(', '))] })] : []),
      ...(content.skills.soft.length ? [new Paragraph({ children: [run('Personal skills: ', { bold: true }), run(content.skills.soft.join(', '))] })] : []),
    ],
    experience: () =>
      content.experience.flatMap((e) => [titleRow(e.title, dates(e.startDate, e.endDate)), ...(join([e.organization, e.location], ', ') ? [sub(join([e.organization, e.location], ', '))] : []), ...e.bullets.map(bullet)]),
    projects: () =>
      content.projects.flatMap((p) => [
        titleRow(p.name, ''),
        ...(p.description ? [para(p.description)] : []),
        ...(p.technologies.length ? [para(`Tools and skills: ${p.technologies.join(', ')}`, t.small)] : []),
        ...(p.link ? [para(p.link, t.small)] : []),
      ]),
    education: () =>
      content.education.flatMap((e) => [titleRow(e.qualification, dates(e.startDate, e.endDate)), ...(join([e.institution, e.location], ', ') ? [sub(join([e.institution, e.location], ', '))] : []), ...(e.details ? [para(e.details, t.small)] : [])]),
    certifications: () => content.certifications.map((c) => bullet(join([c.name, c.issuer, c.date], ', '))),
    volunteer: () =>
      content.volunteer.flatMap((v) => [titleRow(v.role, dates(v.startDate, v.endDate)), ...(v.organization ? [sub(v.organization)] : []), ...(v.description ? [para(v.description)] : [])]),
    languages: () => (content.languages.length ? [para(content.languages.map((l) => (l.proficiency ? `${l.name} (${l.proficiency})` : l.name)).join(', '))] : []),
  };

  const body: Paragraph[] = [...contactBlock(content.contact, t)];
  for (const section of content.layout.sections) {
    if (section.hidden) continue;
    const paragraphs = sections[section.key]();
    if (paragraphs.length) body.push(heading(section.title), ...paragraphs);
  }

  const doc = new Document({
    creator: content.contact.fullName || 'CV Tailor AI',
    title: `${content.contact.fullName || 'Curriculum Vitae'} - CV`,
    styles: { default: { document: { run: { font: t.font, size: t.body } } } },
    sections: [{ properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } }, children: body }],
  });
  return Packer.toBuffer(doc);
}

export async function buildLetterDocx(letter: string, contact: Contact): Promise<Buffer> {
  const font = 'Calibri';
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const header = [contact.fullName, join([contact.email, contact.phone], '  |  '), contact.location].filter(Boolean);
  const doc = new Document({
    styles: { default: { document: { run: { font, size: 22 } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1100, bottom: 1100, left: 1200, right: 1200 } } },
        children: [
          ...header.map((line, i) => new Paragraph({ children: [new TextRun({ text: line, bold: i === 0, size: i === 0 ? 28 : 20, font })] })),
          new Paragraph({ spacing: { before: 240, after: 240 }, children: [new TextRun({ text: today, font })] }),
          ...letter
            .split(/\n\s*\n/)
            .map((block) => block.trim())
            .filter(Boolean)
            .map((block) => new Paragraph({ spacing: { after: 200 }, children: block.split('\n').flatMap((line, i) => [...(i ? [new TextRun({ break: 1 })] : []), new TextRun({ text: line, font })]) })),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
