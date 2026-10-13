import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import JSZip from 'jszip';
import { loadConfig, type Config } from '../src/config.js';
import type { CvContent, Job } from '../src/schemas.js';
import { cvContentSchema } from '../src/schemas.js';
import { sampleProfile } from '../src/services/demo.js';

export const TEST_PASSWORD = 'correct-horse-battery';

export function testConfig(overrides: NodeJS.ProcessEnv = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    APP_PASSWORD: TEST_PASSWORD,
    JWT_SECRET: 'test-secret-test-secret-test-secret-1234',
    SERVE_CLIENT: 'false',
    ...overrides,
  });
}

export const profile = sampleProfile();

export const job: Job = {
  title: 'Backend Engineer',
  company: 'Acme Bank',
  description:
    'We are hiring a Backend Engineer to build payment APIs. Requirements: Node.js, TypeScript, MongoDB, Kubernetes, Kafka and strong communication skills. Experience with REST and Jest is a plus.',
  url: '',
  emphasis: 'Fintech',
};

export function sampleContent(): CvContent {
  return cvContentSchema.parse({
    contact: profile.contact,
    summary: profile.summary,
    skills: profile.skills,
    experience: profile.experience.map((e) => ({ ...e, bullets: [...e.achievements, ...e.responsibilities] })),
    projects: profile.projects,
    education: profile.education,
    certifications: profile.certifications,
    languages: profile.languages,
  });
}

/** A minimal but valid .docx containing the given paragraphs. */
export async function makeDocx(paragraphs: string[]): Promise<Buffer> {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = paragraphs.map((p) => `<w:p><w:r><w:t xml:space="preserve">${esc(p)}</w:t></w:r></w:p>`).join('');
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

export const CV_LINES = [
  'Jordan Example',
  'Software Developer',
  'jordan@example.com | +00 111 222 3333 | linkedin.com/in/jordan-example',
  'Summary',
  'Developer focused on payment systems and web APIs.',
  'Experience',
  'Software Developer | Example Fintech Ltd | Mar 2022 - Present',
  '• Build REST APIs in Node.js for a savings platform.',
  '• Reduced API response time by 35% using caching.',
  'Junior Developer | Demo Agency | Jun 2020 - Feb 2022',
  '• Built client websites with JavaScript.',
  'Education',
  'BSc Computer Science, Example University, 2016 - 2020',
  'Skills',
  'Technical: TypeScript, Node.js, MongoDB, PostgreSQL',
  'Soft: Communication, Teamwork',
  'Languages',
  'English (Fluent), French (Basic)',
];

export interface MockAi {
  url: string;
  requests: { headers: Record<string, unknown>; body: any }[];
  close(): Promise<void>;
}

type Reply = { status?: number; content?: string; raw?: unknown };

/** A local OpenAI-compatible /chat/completions endpoint that plays back queued replies. */
export async function mockAi(replies: Reply[]): Promise<MockAi> {
  const requests: MockAi['requests'] = [];
  const queue = [...replies];
  const server: Server = createServer((req, res) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      requests.push({ headers: req.headers, body: JSON.parse(data || '{}') });
      const reply = queue.shift() ?? { status: 500 };
      const status = reply.status ?? 200;
      res.writeHead(status, { 'content-type': 'application/json' });
      if (reply.raw !== undefined) res.end(JSON.stringify(reply.raw));
      else if (status !== 200) res.end(JSON.stringify({ error: { message: 'mock failure' } }));
      else res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: reply.content } }] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/v1`,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
