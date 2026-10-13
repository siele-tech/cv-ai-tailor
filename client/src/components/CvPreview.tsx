import type { ReactNode } from 'react';
import type { CvContent } from '../types';

// On-screen preview that mirrors the structure and order of the generated PDF
// (server/src/services/pdf.ts): single column, same sections, same accent colour.

const join = (parts: string[], sep: string) => parts.map((p) => p.trim()).filter(Boolean).join(sep);
const dates = (start: string, end: string) => join([start, end], ' – ');

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="mt-5 mb-2 border-b border-slate-300 pb-1 text-[11px] font-bold tracking-[0.12em] text-brand-700 uppercase">{children}</h3>;
}

function TitleRow({ title, when }: { title: string; when: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <p className="font-semibold text-slate-900">{title}</p>
      {when && <p className="shrink-0 text-xs text-slate-600">{when}</p>}
    </div>
  );
}

export function CvPreview({ content }: { content: CvContent }) {
  const { contact, skills } = content;
  const contactLine = join([contact.email, contact.phone, contact.location], '  |  ');
  const linkLine = join([contact.linkedin, contact.github, contact.portfolio], '  |  ');

  return (
    <article aria-label="CV preview" className="rounded-lg border border-slate-300 bg-white px-5 py-6 text-[13px] leading-relaxed text-slate-900 shadow-md sm:px-8 sm:py-8">
      <h2 className="text-2xl leading-tight font-bold text-brand-700">{contact.fullName || 'Your Name'}</h2>
      {contact.headline && <p className="mt-0.5 text-sm">{contact.headline}</p>}
      {contactLine && <p className="mt-1.5 text-xs break-words text-slate-600">{contactLine}</p>}
      {linkLine && <p className="text-xs break-words text-slate-600">{linkLine}</p>}

      {content.summary.trim() && (
        <>
          <Heading>Professional Summary</Heading>
          <p className="whitespace-pre-line">{content.summary}</p>
        </>
      )}

      {(skills.technical.length > 0 || skills.soft.length > 0) && (
        <>
          <Heading>Skills</Heading>
          {skills.technical.length > 0 && (
            <p>
              <span className="font-semibold">Technical: </span>
              {skills.technical.join(', ')}
            </p>
          )}
          {skills.soft.length > 0 && (
            <p className="mt-1">
              <span className="font-semibold">Soft skills: </span>
              {skills.soft.join(', ')}
            </p>
          )}
        </>
      )}

      {content.experience.length > 0 && (
        <>
          <Heading>Professional Experience</Heading>
          <div className="space-y-3">
            {content.experience.map((exp) => (
              <div key={exp.id}>
                <TitleRow title={exp.title} when={dates(exp.startDate, exp.endDate)} />
                <p className="text-slate-600 italic">{join([exp.organization, exp.location], ', ')}</p>
                {exp.bullets.length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {exp.bullets.map((bullet, i) => (
                      <li key={i}>{bullet}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {content.projects.length > 0 && (
        <>
          <Heading>Projects</Heading>
          <div className="space-y-2.5">
            {content.projects.map((project) => (
              <div key={project.id}>
                <TitleRow title={project.name} when="" />
                {project.description && <p>{project.description}</p>}
                {project.technologies.length > 0 && <p className="text-xs text-slate-600">Technologies: {project.technologies.join(', ')}</p>}
                {project.link && <p className="text-xs break-words text-slate-600">{project.link}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      {content.education.length > 0 && (
        <>
          <Heading>Education</Heading>
          <div className="space-y-2">
            {content.education.map((edu) => (
              <div key={edu.id}>
                <TitleRow title={edu.qualification} when={dates(edu.startDate, edu.endDate)} />
                <p className="text-slate-600 italic">{join([edu.institution, edu.location], ', ')}</p>
                {edu.details && <p className="text-xs">{edu.details}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      {content.certifications.length > 0 && (
        <>
          <Heading>Certifications &amp; Training</Heading>
          <ul className="list-disc space-y-0.5 pl-4">
            {content.certifications.map((cert) => (
              <li key={cert.id}>{join([cert.name, cert.issuer, cert.date], ', ')}</li>
            ))}
          </ul>
        </>
      )}

      {content.volunteer.length > 0 && (
        <>
          <Heading>Volunteer Experience</Heading>
          <div className="space-y-2">
            {content.volunteer.map((vol) => (
              <div key={vol.id}>
                <TitleRow title={vol.role} when={dates(vol.startDate, vol.endDate)} />
                <p className="text-slate-600 italic">{vol.organization}</p>
                {vol.description && <p>{vol.description}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      {content.languages.length > 0 && (
        <>
          <Heading>Languages</Heading>
          <p>{content.languages.map((l) => (l.proficiency ? `${l.name} (${l.proficiency})` : l.name)).join(', ')}</p>
        </>
      )}
    </article>
  );
}
