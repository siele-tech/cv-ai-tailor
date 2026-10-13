import {
  analysisSchema,
  cvContentSchema,
  type Analysis,
  type CvContent,
  type Job,
  type Profile,
} from '../schemas.js';
import { normalizeProfile } from './normalizeProfile.js';
import { containsTerm, profileFacts, verbatimBullets } from './safeguards.js';

// Demo mode: used only when no AI API key is configured. Nothing here calls a model and the
// result is always labelled generatedBy: "demo". Text is copied from the master profile
// unchanged and merely reordered by keyword overlap with the job description.

/** Common requirement terms, used to spot things a job asks for that the profile lacks. */
const KNOWN_TERMS = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 'C++', 'Golang', 'Rust', 'PHP', 'Ruby', 'Kotlin', 'Swift', 'Scala',
  'React', 'Angular', 'Vue', 'Next.js', 'Svelte', 'Redux', 'Tailwind CSS', 'HTML', 'CSS', 'Sass',
  'Node.js', 'Express', 'NestJS', 'Django', 'Flask', 'FastAPI', 'Spring Boot', '.NET', 'Laravel', 'Ruby on Rails',
  'REST', 'GraphQL', 'gRPC', 'Microservices', 'WebSockets', 'OAuth', 'JWT',
  'SQL', 'PostgreSQL', 'MySQL', 'SQL Server', 'Oracle', 'MongoDB', 'Redis', 'Elasticsearch', 'DynamoDB', 'Cassandra',
  'AWS', 'Azure', 'GCP', 'Google Cloud', 'Docker', 'Kubernetes', 'Terraform', 'Ansible', 'Jenkins', 'GitHub Actions',
  'GitLab CI', 'CI/CD', 'Linux', 'Bash', 'Git', 'Nginx', 'Prometheus', 'Grafana', 'Kafka', 'RabbitMQ',
  'Machine Learning', 'Deep Learning', 'NLP', 'LLM', 'TensorFlow', 'PyTorch', 'scikit-learn', 'Pandas', 'NumPy',
  'Data Analysis', 'Data Engineering', 'ETL', 'Airflow', 'Spark', 'Hadoop', 'Snowflake', 'BigQuery', 'dbt',
  'Power BI', 'Tableau', 'Excel', 'Looker', 'Statistics', 'A/B Testing',
  'Agile', 'Scrum', 'Kanban', 'Jira', 'TDD', 'Unit Testing', 'Jest', 'Cypress', 'Selenium', 'Playwright',
  'Payments', 'Mobile Money', 'Core Banking', 'KYC', 'AML', 'PCI DSS', 'ISO 27001', 'Open Banking', 'Blockchain',
  'Cybersecurity', 'Penetration Testing', 'Networking', 'Active Directory', 'ITIL', 'Flutter', 'React Native', 'Android', 'iOS',
];

const countHits = (text: string, terms: string[]) => {
  const lower = text.toLowerCase();
  return terms.reduce((n, term) => n + (containsTerm(lower, term) ? 1 : 0), 0);
};

/** Stable sort: most keyword hits first, original order otherwise. */
function byRelevance<T>(items: T[], textOf: (item: T) => string, terms: string[]): T[] {
  return items
    .map((item, index) => ({ item, index, hits: countHits(textOf(item), terms) }))
    .sort((a, b) => b.hits - a.hits || a.index - b.index)
    .map((x) => x.item);
}

export function demoTailor(profile: Profile, job: Job): { content: CvContent; analysis: Analysis } {
  const facts = profileFacts(profile);
  const jd = `${job.title}\n${job.description}`.toLowerCase();

  const own = [...new Set([...profile.skills.technical, ...profile.skills.soft, ...profile.projects.flatMap((p) => p.technologies)])];
  const matched = own.filter((skill) => containsTerm(jd, skill));
  const missing = KNOWN_TERMS.filter((term) => containsTerm(jd, term) && !facts.supports(term));
  const isMatched = (skill: string) => matched.includes(skill);

  const content = cvContentSchema.parse({
    contact: profile.contact,
    summary: profile.summary,
    skills: {
      technical: [...profile.skills.technical.filter(isMatched), ...profile.skills.technical.filter((s) => !isMatched(s))],
      soft: [...profile.skills.soft.filter(isMatched), ...profile.skills.soft.filter((s) => !isMatched(s))],
    },
    experience: profile.experience.map((exp) => ({
      id: exp.id,
      title: exp.title,
      organization: exp.organization,
      location: exp.location,
      startDate: exp.startDate,
      endDate: exp.endDate,
      bullets: byRelevance(verbatimBullets(exp, 40), (b) => b, matched).slice(0, 6),
    })),
    projects: byRelevance(profile.projects, (p) => `${p.name} ${p.description} ${p.technologies.join(' ')}`, matched).slice(0, 4),
    education: profile.education,
    certifications: profile.certifications,
    volunteer: profile.volunteer,
    languages: profile.languages,
  });

  const relevant = profile.experience
    .map((exp) => ({ exp, hits: countHits([...exp.responsibilities, ...exp.achievements, exp.title].join(' '), matched) }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 4)
    .map(({ exp, hits }) => `${[exp.title, exp.organization].filter(Boolean).join(' at ')} (mentions ${hits} of the job's keywords)`);

  const total = matched.length + missing.length;
  const suggestions = [
    'Add an AI API key on the server (see the README) to get a rewritten summary and achievement-focused bullet points.',
  ];
  if (missing.length) {
    suggestions.push(`The job mentions ${missing.slice(0, 8).join(', ')}. If you genuinely have experience with any of these, add it to your master profile and tailor again.`);
  }
  if (!profile.summary) suggestions.push('Your master profile has no professional summary. Add one so it can appear on your CV.');

  const analysis = analysisSchema.parse({
    score: total === 0 ? 0 : Math.min(95, Math.round((matched.length / total) * 100)),
    matchedSkills: matched,
    missingSkills: missing,
    relevantExperience: relevant,
    keywordsIncluded: matched,
    suggestions,
    flags: [
      'Demo mode: no AI model was used. The wording is copied from your master CV unchanged and only reordered by keyword overlap with the job description.',
      ...(total === 0 ? ['No recognisable skill keywords were found in the job description, so the score could not be estimated.'] : []),
    ],
  });

  return { content, analysis };
}

/** Clearly fictional sample data so the app can be explored before a real CV is added. */
export function sampleProfile(): Profile {
  return normalizeProfile({
    contact: {
      fullName: 'Sample Candidate',
      headline: 'Full-Stack Software Developer',
      email: 'sample.candidate@example.com',
      phone: '+00 000 000 0000',
      location: 'Sample City',
      linkedin: 'linkedin.com/in/sample-candidate',
      github: 'github.com/sample-candidate',
      portfolio: '',
    },
    summary:
      'Full-stack developer with experience building web applications for financial services using TypeScript, React and Node.js. Comfortable across the stack, from database design to responsive interfaces.',
    experience: [
      {
        title: 'Software Developer',
        organization: 'Example Fintech Ltd',
        location: 'Sample City',
        startDate: 'Mar 2022',
        endDate: 'Present',
        responsibilities: [
          'Build and maintain REST APIs in Node.js and Express for a savings and loans platform.',
          'Develop responsive React and TypeScript interfaces used by field agents on mobile devices.',
          'Write unit and integration tests with Jest and review pull requests for a team of five developers.',
          'Design MongoDB schemas and optimise slow queries.',
        ],
        achievements: ['Reduced average API response time by 35% by adding caching and query indexes.'],
      },
      {
        title: 'Junior Web Developer',
        organization: 'Demo Digital Agency',
        location: 'Sample City',
        startDate: 'Jun 2020',
        endDate: 'Feb 2022',
        responsibilities: [
          'Built client websites with JavaScript, HTML and CSS.',
          'Maintained a PostgreSQL reporting database and wrote SQL reports for account managers.',
          'Set up GitHub Actions pipelines to run tests and deploy to staging.',
        ],
        achievements: [],
      },
    ],
    skills: {
      technical: ['TypeScript', 'JavaScript', 'React', 'Node.js', 'Express', 'MongoDB', 'PostgreSQL', 'SQL', 'REST', 'Git', 'GitHub Actions', 'Jest', 'HTML', 'CSS', 'Tailwind CSS'],
      soft: ['Communication', 'Teamwork', 'Problem-solving'],
    },
    education: [
      { qualification: 'BSc Computer Science', institution: 'Example University', location: 'Sample City', startDate: '2016', endDate: '2020', details: '' },
    ],
    certifications: [{ name: 'Example Cloud Practitioner Certificate', issuer: 'Example Cloud Academy', date: '2023' }],
    projects: [
      {
        name: 'Budget Tracker',
        description: 'Personal finance web app that imports bank statements and categorises spending.',
        technologies: ['React', 'TypeScript', 'Node.js', 'MongoDB'],
        link: '',
      },
    ],
    volunteer: [],
    languages: [{ name: 'English', proficiency: 'Fluent' }],
  });
}
