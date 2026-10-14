// Writes a sample PDF built from the fictional demo profile, for checking the layout by eye.
// Usage: npx tsx scripts/sample-pdf.ts [output.pdf] [--long] [--design=professional|modern|classic|compact]
import { writeFileSync } from 'node:fs';
import { cvContentSchema } from '../src/schemas.js';
import { sampleProfile } from '../src/services/demo.js';
import { renderCvPdfWithInfo } from '../src/services/pdf.js';

const args = process.argv.slice(2);
const long = args.includes('--long');
const design = args.find((a) => a.startsWith('--design='))?.slice('--design='.length);
const output = args.find((a) => !a.startsWith('--')) ?? 'sample-cv.pdf';

const profile = sampleProfile();
const roles = long ? [...profile.experience, ...profile.experience, ...profile.experience, ...profile.experience] : profile.experience;

const content = cvContentSchema.parse({
  ...profile,
  experience: roles.map((e, i) => ({ ...e, id: `${e.id}-${i}`, bullets: [...e.achievements, ...e.responsibilities] })),
  design,
});

const { buffer, pages } = await renderCvPdfWithInfo(content);
writeFileSync(output, buffer);
console.log(`Wrote ${output} (${content.design}, ${pages} page${pages === 1 ? '' : 's'})`);
