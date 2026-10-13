// Writes a sample PDF built from the fictional demo profile, for checking the layout by eye.
// Usage: npx tsx scripts/sample-pdf.ts [output.pdf] [--long]
import { writeFileSync } from 'node:fs';
import { cvContentSchema } from '../src/schemas.js';
import { sampleProfile } from '../src/services/demo.js';
import { renderCvPdf } from '../src/services/pdf.js';

const args = process.argv.slice(2);
const long = args.includes('--long');
const output = args.find((a) => !a.startsWith('--')) ?? 'sample-cv.pdf';

const profile = sampleProfile();
const roles = long ? [...profile.experience, ...profile.experience, ...profile.experience, ...profile.experience] : profile.experience;

const content = cvContentSchema.parse({
  ...profile,
  experience: roles.map((e, i) => ({ ...e, id: `${e.id}-${i}`, bullets: [...e.achievements, ...e.responsibilities] })),
});

writeFileSync(output, await renderCvPdf(content));
console.log(`Wrote ${output}`);
