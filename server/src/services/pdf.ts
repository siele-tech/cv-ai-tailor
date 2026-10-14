import PDFDocument from 'pdfkit';
import type { Contact, CvContent, Design, SectionKey } from '../schemas.js';

// ATS-friendly CV: single column, real (selectable) text, standard fonts, no graphics
// beyond thin rules under headings. Layout is done block by block so that headings are
// never stranded at the foot of a page and bullets are not split when they fit on one.

const INK = '#111111';
const MUTED = '#444444';
const BULLET_INDENT = 11;

const HELVETICA = { regular: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique' };
const TIMES = { regular: 'Times-Roman', bold: 'Times-Bold', italic: 'Times-Italic' };

interface DesignStyle {
  margin: number;
  font: typeof HELVETICA;
  size: { name: number; headline: number; contact: number; heading: number; body: number; small: number };
  lineGap: number;
  /** Multiplier for the space between blocks. */
  spacing: number;
  accent: string;
  rule: string;
  /** plain: name on the page; band: name in a coloured band; centered: traditional centred header. */
  header: 'plain' | 'band' | 'centered';
  /** rule: heading with a line under it; bar: heading with a short accent bar beside it. */
  headingStyle: 'rule' | 'bar';
}

export const DESIGN_STYLES: Record<Design, DesignStyle> = {
  professional: {
    margin: 48, font: HELVETICA, lineGap: 2.2, spacing: 1, accent: '#1f3a5f', rule: '#9aa7b8', header: 'plain', headingStyle: 'rule',
    size: { name: 20, headline: 11, contact: 9.5, heading: 10.5, body: 10, small: 9.5 },
  },
  modern: {
    margin: 46, font: HELVETICA, lineGap: 2.2, spacing: 1, accent: '#3730a3', rule: '#c7d2fe', header: 'band', headingStyle: 'bar',
    size: { name: 22, headline: 11.5, contact: 9.5, heading: 10.5, body: 10, small: 9.5 },
  },
  classic: {
    margin: 54, font: TIMES, lineGap: 2, spacing: 1, accent: '#111111', rule: '#555555', header: 'centered', headingStyle: 'rule',
    size: { name: 22, headline: 12, contact: 10, heading: 11.5, body: 11, small: 10.5 },
  },
  compact: {
    margin: 34, font: HELVETICA, lineGap: 1.2, spacing: 0.6, accent: '#1f3a5f', rule: '#9aa7b8', header: 'plain', headingStyle: 'rule',
    size: { name: 17, headline: 10, contact: 8.5, heading: 9.5, body: 9, small: 8.5 },
  },
};

// Characters outside Latin-1 that the standard PDF fonts (WinAnsi encoding) can still draw.
const WIN_ANSI_EXTRAS = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const REPLACEMENTS: Record<string, string> = {
  '\u2192': '->', '\u2190': '<-', '\u2713': '-', '\u2714': '-', '\u25cf': '•', '\u25aa': '•', '\u25e6': '•',
  '\u2010': '-', '\u2011': '-', '\u2012': '-', '\u2015': '—', '\u2032': "'", '\u2033': '"', '\u00a0': ' ',
  '\u0141': 'L', '\u0142': 'l', '\u0110': 'D', '\u0111': 'd', '\u0131': 'i',
  '\u2009': ' ', '\u200a': ' ', '\u202f': ' ', '\u2002': ' ', '\u2003': ' ',
};

/** Make text safe for the built-in fonts: unsupported characters are transliterated, not dropped silently. */
export function pdfSafe(input: string): string {
  let out = '';
  for (const ch of input.replace(/[\u200b-\u200d\ufeff]/g, '')) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === '\n' || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRAS.has(ch)) {
      out += ch;
    } else if (REPLACEMENTS[ch] !== undefined) {
      out += REPLACEMENTS[ch];
    } else if (code < 0x20) {
      out += ' ';
    } else {
      // e.g. "ł" -> "l", "ş" -> "s"; anything with no Latin base becomes "?"
      const base = ch.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
      out += /^[\x20-\x7e\xa0-\xff]+$/.test(base) ? base : '?';
    }
  }
  return out;
}

const dateRange = (start: string, end: string) => [start, end].filter(Boolean).join(' – ');
const joinParts = (parts: string[], sep: string) => parts.map((p) => p.trim()).filter(Boolean).join(sep);

export async function renderCvPdf(content: CvContent): Promise<Buffer> {
  return (await renderCvPdfWithInfo(content)).buffer;
}

/** The PDF and its page count (used for the one-page check). */
export function renderCvPdfWithInfo(content: CvContent): Promise<{ buffer: Buffer; pages: number }> {
  const D = DESIGN_STYLES[content.design] ?? DESIGN_STYLES.professional;
  const FONT = D.font;
  const SIZE = D.size;
  const LINE_GAP = D.lineGap;
  const ACCENT = D.accent;
  const RULE = D.rule;
  let pageCount = 1;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: D.margin,
      bufferPages: true,
      info: {
        Title: pdfSafe(`${content.contact.fullName || 'Curriculum Vitae'} - CV`),
        Author: pdfSafe(content.contact.fullName),
        Subject: 'Curriculum Vitae',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), pages: pageCount }));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const bottom = () => doc.page.height - doc.page.margins.bottom;

    type Style = { font?: string; size?: number; color?: string };
    const use = ({ font = FONT.regular, size = SIZE.body, color = INK }: Style = {}) =>
      doc.font(font).fontSize(size).fillColor(color);

    const heightOf = (text: string, w: number, style: Style = {}) => {
      use(style);
      return doc.heightOfString(text, { width: w, lineGap: LINE_GAP });
    };

    /** Start a new page unless `needed` points of vertical space remain. */
    const ensure = (needed: number) => {
      if (doc.y + needed > bottom()) doc.addPage();
    };

    const paragraph = (raw: string, style: Style = {}, indent = 0) => {
      const text = pdfSafe(raw).trim();
      if (!text) return;
      const w = width - indent;
      // Keep short blocks whole; let long ones flow across pages naturally.
      const h = heightOf(text, w, style);
      if (h < 160) ensure(h);
      use(style);
      doc.text(text, left + indent, doc.y, { width: w, lineGap: LINE_GAP });
    };

    const bullet = (raw: string) => {
      const text = pdfSafe(raw).trim();
      if (!text) return;
      const w = width - BULLET_INDENT;
      const h = heightOf(text, w);
      if (h < 200) ensure(h);
      const y = doc.y;
      use();
      doc.text('•', left + 1, y, { lineBreak: false });
      doc.text(text, left + BULLET_INDENT, y, { width: w, lineGap: LINE_GAP });
      doc.moveDown(0.18 * D.spacing);
    };

    /** Bold text on the left with a right-aligned date on the same line. */
    const titleRow = (rawTitle: string, rawDates: string) => {
      const title = pdfSafe(rawTitle).trim();
      const dates = pdfSafe(rawDates).trim();
      use({ size: SIZE.small, color: MUTED });
      const datesWidth = dates ? doc.widthOfString(dates) + 12 : 0;
      const titleWidth = width - datesWidth;
      const y = doc.y;
      // Title first, so text extractors and ATS parsers read the title before the dates.
      use({ font: FONT.bold, size: SIZE.body + 0.5 });
      doc.text(title || ' ', left, y, { width: titleWidth, lineGap: LINE_GAP });
      if (dates) {
        const after = doc.y;
        use({ size: SIZE.small, color: MUTED });
        doc.text(dates, left + titleWidth, y + 0.5, { width: datesWidth, align: 'right', lineBreak: false });
        doc.y = after;
      }
    };

    /**
     * Section heading. `keepWith` is the height of the first block of the section, so the
     * heading always travels with at least that much content.
     */
    const heading = (label: string, keepWith: number) => {
      doc.moveDown(0.75 * D.spacing);
      ensure(SIZE.heading + 12 + keepWith);
      const text = pdfSafe(label).toUpperCase();
      if (D.headingStyle === 'bar') {
        // A short accent bar beside the heading; no full-width rule.
        const top = doc.y;
        doc.rect(left, top + 1, 3, SIZE.heading).fill(ACCENT);
        use({ font: FONT.bold, size: SIZE.heading, color: ACCENT });
        doc.text(text, left + 9, top, { width: width - 9, characterSpacing: 0.8 });
        doc.y += 4;
        return;
      }
      use({ font: FONT.bold, size: SIZE.heading, color: ACCENT });
      doc.text(text, left, doc.y, { width, characterSpacing: 0.8, align: D.header === 'centered' ? 'center' : 'left' });
      const y = doc.y + 1.5;
      doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.7).strokeColor(RULE).stroke();
      doc.y = y + 6 * Math.max(D.spacing, 0.7);
    };

    const bulletHeight = (raw: string) => heightOf(pdfSafe(raw), width - BULLET_INDENT) + 3;
    const ROW = SIZE.body + 6;

    // ---------- header ----------
    const { contact } = content;
    const name = pdfSafe(contact.fullName) || 'Your Name';
    const headline = pdfSafe(contact.headline).trim();
    const contactLine = pdfSafe(joinParts([contact.email, contact.phone, contact.location], '  |  '));
    const linkLine = pdfSafe(joinParts([contact.linkedin, contact.github, contact.portfolio], '  |  '));

    if (D.header === 'band') {
      // Name and contact details in white on a coloured band across the top of the first page.
      const pad = 22;
      const parts: [string, Style][] = [
        [name, { font: FONT.bold, size: SIZE.name }],
        ...(headline ? [[headline, { size: SIZE.headline }] as [string, Style]] : []),
        ...(contactLine ? [[contactLine, { size: SIZE.contact }] as [string, Style]] : []),
        ...(linkLine ? [[linkLine, { size: SIZE.contact }] as [string, Style]] : []),
      ];
      const textHeight = parts.reduce((sum, [text, style]) => sum + heightOf(text, width, style) + 2, 0);
      const bandHeight = D.margin * 0.55 + textHeight + pad;
      doc.rect(0, 0, doc.page.width, bandHeight).fill(ACCENT);
      doc.y = D.margin * 0.55;
      for (const [text, style] of parts) {
        use({ ...style, color: '#ffffff' });
        doc.text(text, left, doc.y, { width, lineGap: LINE_GAP });
        doc.y += 2;
      }
      doc.y = bandHeight + 10;
    } else {
      const align = D.header === 'centered' ? 'center' : 'left';
      use({ font: FONT.bold, size: SIZE.name, color: ACCENT });
      doc.text(name, left, doc.y, { width, align });
      if (headline) {
        doc.moveDown(0.1 * D.spacing);
        use({ size: SIZE.headline, color: INK });
        doc.text(headline, left, doc.y, { width, align, lineGap: LINE_GAP });
      }
      doc.moveDown(0.25 * D.spacing);
      for (const line of [contactLine, linkLine]) {
        if (!line) continue;
        use({ size: SIZE.contact, color: MUTED });
        doc.text(line, left, doc.y, { width, align, lineGap: LINE_GAP });
      }
      if (D.header === 'centered') {
        const y = doc.y + 4;
        doc.moveTo(left, y).lineTo(left + width, y).lineWidth(1).strokeColor(INK).stroke();
        doc.y = y + 2;
      }
    }

    // ---------- sections, in the order and with the headings of the CV's own structure ----------
    const render = {} as Record<SectionKey, (title: string) => void>;

    render.summary = (title) => {
    if (content.summary.trim()) {
      heading(title, Math.min(heightOf(pdfSafe(content.summary), width), 60));
      paragraph(content.summary);
    }

    };

    render.skills = (title) => {
    const skillRows: [string, string[]][] = [
      ['Key skills', content.skills.technical],
      ['Personal skills', content.skills.soft],
    ];
    const shownSkills = skillRows.filter(([, items]) => items.length > 0);
    if (shownSkills.length) {
      heading(title, ROW * 2);
      for (const [label, items] of shownSkills) {
        const text = pdfSafe(items.join(', '));
        ensure(Math.min(heightOf(`${label}: ${text}`, width), 120));
        use({ font: FONT.bold });
        doc.text(`${label}: `, left, doc.y, { width, lineGap: LINE_GAP, continued: true });
        use();
        doc.text(text, { width, lineGap: LINE_GAP });
        doc.moveDown(0.2 * D.spacing);
      }
    }

    };

    render.experience = (title) => {
    if (content.experience.length) {
      const first = content.experience[0];
      heading(title, ROW * 2 + (first?.bullets[0] ? bulletHeight(first.bullets[0]) : 0));
      content.experience.forEach((exp, index) => {
        if (index > 0) doc.moveDown(0.55 * D.spacing);
        // Keep the role header together with its first bullet.
        ensure(ROW * 2 + (exp.bullets[0] ? bulletHeight(exp.bullets[0]) : 0));
        titleRow(exp.title, dateRange(exp.startDate, exp.endDate));
        paragraph(joinParts([exp.organization, exp.location], ', '), { font: FONT.italic, color: MUTED });
        doc.moveDown(0.2 * D.spacing);
        exp.bullets.forEach(bullet);
      });
    }

    };

    render.projects = (title) => {
    if (content.projects.length) {
      heading(title, ROW * 3);
      content.projects.forEach((project, index) => {
        if (index > 0) doc.moveDown(0.45 * D.spacing);
        const body = pdfSafe(project.description);
        ensure(ROW + Math.min(body ? heightOf(body, width) : 0, 80));
        titleRow(project.name, '');
        paragraph(project.description);
        if (project.technologies.length) {
          paragraph(`Tools and skills: ${project.technologies.join(', ')}`, { size: SIZE.small, color: MUTED });
        }
        paragraph(project.link, { size: SIZE.small, color: MUTED });
      });
    }

    };

    render.education = (title) => {
    if (content.education.length) {
      heading(title, ROW * 2);
      content.education.forEach((edu, index) => {
        if (index > 0) doc.moveDown(0.4 * D.spacing);
        ensure(ROW * 2);
        titleRow(edu.qualification, dateRange(edu.startDate, edu.endDate));
        paragraph(joinParts([edu.institution, edu.location], ', '), { font: FONT.italic, color: MUTED });
        paragraph(edu.details, { size: SIZE.small });
      });
    }

    };

    render.certifications = (title) => {
    if (content.certifications.length) {
      heading(title, ROW);
      for (const cert of content.certifications) {
        bullet(joinParts([cert.name, cert.issuer, cert.date], ', '));
      }
    }

    };

    render.volunteer = (title) => {
    if (content.volunteer.length) {
      heading(title, ROW * 2);
      content.volunteer.forEach((vol, index) => {
        if (index > 0) doc.moveDown(0.4 * D.spacing);
        ensure(ROW * 2);
        titleRow(vol.role, dateRange(vol.startDate, vol.endDate));
        paragraph(vol.organization, { font: FONT.italic, color: MUTED });
        paragraph(vol.description);
      });
    }

    };

    render.languages = (title) => {
    if (content.languages.length) {
      heading(title, ROW);
      paragraph(
        content.languages.map((l) => (l.proficiency ? `${l.name} (${l.proficiency})` : l.name)).join(', '),
      );
    }
    };

    for (const section of content.layout.sections) {
      if (!section.hidden) render[section.key](section.title);
    }

    // ---------- page numbers (only when there is more than one page) ----------
    const range = doc.bufferedPageRange();
    pageCount = range.count;
    if (range.count > 1) {
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        // Writing inside the bottom margin would trigger an automatic page break.
        const saved = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        use({ size: 8, color: MUTED });
        doc.text(`Page ${i + 1} of ${range.count}`, left, doc.page.height - 30, { width, align: 'center', lineBreak: false });
        doc.page.margins.bottom = saved;
      }
    }

    doc.end();
  });
}

/** A cover letter in the same visual family as the CV. */
export function renderLetterPdf(letter: string, contact: Contact, design: Design = 'professional'): Promise<Buffer> {
  const D = DESIGN_STYLES[design] ?? DESIGN_STYLES.professional;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 64, info: { Title: pdfSafe(`${contact.fullName || 'Cover letter'} - Cover letter`), Author: pdfSafe(contact.fullName) } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const width = doc.page.width - 128;

    doc.font(D.font.bold).fontSize(18).fillColor(D.accent).text(pdfSafe(contact.fullName) || 'Your Name', { width });
    const details = joinParts([contact.email, contact.phone, contact.location], '  |  ');
    if (details) doc.font(D.font.regular).fontSize(9.5).fillColor(MUTED).text(pdfSafe(details), { width });
    const y = doc.y + 8;
    doc.moveTo(64, y).lineTo(64 + width, y).lineWidth(0.7).strokeColor(D.rule).stroke();
    doc.y = y + 18;

    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    doc.font(D.font.regular).fontSize(11).fillColor(INK).text(today, { width });
    doc.moveDown(1.2);
    for (const block of letter.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)) {
      doc.font(D.font.regular).fontSize(11).fillColor(INK).text(pdfSafe(block), { width, lineGap: 3, align: 'left' });
      doc.moveDown(0.9);
    }
    doc.end();
  });
}

/** "Acme Bank" + "Senior Engineer" -> "Acme_Bank_Senior_Engineer_Tailored_CV.pdf" */
export function cvFilename(company: string, jobTitle: string): string {
  const clean = (value: string) =>
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40)
      .replace(/_+$/, '');
  const parts = [clean(company), clean(jobTitle)].filter(Boolean);
  return `${[...parts, 'Tailored_CV'].join('_')}.pdf`;
}
