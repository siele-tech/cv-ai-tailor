import { useState, type ReactNode } from 'react';
import {
  newId,
  type Certification,
  type Contact,
  type CvExperience,
  type Education,
  type Experience,
  type Language,
  type Project,
  type Skills,
  type Volunteer,
} from '../types';
import { Button, Field, Icon, ListText, TextArea } from './ui';

// Form building blocks shared by the master profile editor and the tailored CV editor.

export function Section({ title, count, defaultOpen = false, children }: { title: string; count?: number; defaultOpen?: boolean; children: ReactNode }) {
  // Owned here so a re-render never collapses a section the user is typing in.
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="group rounded-2xl border border-white/70 bg-white/90 shadow-sm backdrop-blur open:shadow-md">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 font-semibold text-slate-900">
        <span>
          {title}
          {count !== undefined && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{count}</span>}
        </span>
        <Icon name="chevron" className="h-5 w-5 text-slate-400 transition-transform group-open:rotate-90" />
      </summary>
      <div className="space-y-4 border-t border-slate-100 p-4">{children}</div>
    </details>
  );
}

interface ItemListProps<T extends { id: string }> {
  items: T[];
  onChange(items: T[]): void;
  create(): T;
  addLabel: string;
  itemLabel(item: T, index: number): string;
  render(item: T, update: (patch: Partial<T>) => void): ReactNode;
  emptyText: string;
}

function ItemList<T extends { id: string }>({ items, onChange, create, addLabel, itemLabel, render, emptyText }: ItemListProps<T>) {
  const update = (id: string, patch: Partial<T>) => onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const remove = (id: string) => onChange(items.filter((item) => item.id !== id));
  const moveUp = (index: number) => {
    const next = [...items];
    const [item] = next.splice(index, 1);
    if (item) next.splice(index - 1, 0, item);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {items.length === 0 && <p className="text-sm text-slate-500">{emptyText}</p>}
      {items.map((item, index) => (
        <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-semibold text-slate-800">{itemLabel(item, index)}</p>
            <div className="flex shrink-0 gap-1">
              {index > 0 && (
                <button type="button" onClick={() => moveUp(index)} aria-label="Move up" className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200">
                  <Icon name="up" />
                </button>
              )}
              <button type="button" onClick={() => remove(item.id)} aria-label={`Remove ${itemLabel(item, index)}`} className="flex h-10 w-10 items-center justify-center rounded-lg text-red-600 hover:bg-red-50">
                <Icon name="trash" />
              </button>
            </div>
          </div>
          <div className="space-y-3">{render(item, (patch) => update(item.id, patch))}</div>
        </div>
      ))}
      <Button icon="plus" className="w-full" onClick={() => onChange([...items, create()])}>
        {addLabel}
      </Button>
    </div>
  );
}

const Row = ({ children }: { children: ReactNode }) => <div className="grid grid-cols-2 gap-3">{children}</div>;
const or = (value: string, fallback: string) => value.trim() || fallback;

// ---------- contact, skills ----------

export function ContactFields({ value, onChange }: { value: Contact; onChange(value: Contact): void }) {
  const set = (patch: Partial<Contact>) => onChange({ ...value, ...patch });
  return (
    <>
      <Field label="Full name" value={value.fullName} onChange={(fullName) => set({ fullName })} autoComplete="name" maxLength={120} />
      <Field label="Professional headline" value={value.headline} onChange={(headline) => set({ headline })} placeholder="e.g. Full-Stack Developer" maxLength={160} />
      <Field label="Email" type="email" inputMode="email" value={value.email} onChange={(email) => set({ email })} autoComplete="email" maxLength={160} />
      <Field label="Phone" type="tel" inputMode="tel" value={value.phone} onChange={(phone) => set({ phone })} autoComplete="tel" maxLength={60} />
      <Field label="Location" value={value.location} onChange={(location) => set({ location })} placeholder="City, Country" maxLength={160} />
      <Field label="LinkedIn" inputMode="url" value={value.linkedin} onChange={(linkedin) => set({ linkedin })} placeholder="linkedin.com/in/…" maxLength={300} />
      <Field label="GitHub" inputMode="url" value={value.github} onChange={(github) => set({ github })} placeholder="github.com/…" maxLength={300} />
      <Field label="Portfolio or website" inputMode="url" value={value.portfolio} onChange={(portfolio) => set({ portfolio })} maxLength={300} />
    </>
  );
}

export function SkillsFields({ value, onChange }: { value: Skills; onChange(value: Skills): void }) {
  return (
    <>
      <ListText mode="commas" label="Key skills (job-specific)" rows={4} value={value.technical} onChange={(technical) => onChange({ ...value, technical })} placeholder="e.g. Bookkeeping, Patient care, Microsoft Excel, Python" />
      <ListText mode="commas" label="Personal skills" value={value.soft} onChange={(soft) => onChange({ ...value, soft })} placeholder="Communication, Teamwork" />
    </>
  );
}

// ---------- experience ----------

function ExperienceHeader<T extends CvExperience | Experience>({ item, update }: { item: T; update(patch: Partial<T>): void }) {
  const set = (patch: Partial<CvExperience>) => update(patch as Partial<T>);
  return (
    <>
      <Field label="Job title" value={item.title} onChange={(title) => set({ title })} maxLength={160} />
      <Field label="Organization" value={item.organization} onChange={(organization) => set({ organization })} maxLength={160} />
      <Field label="Location" value={item.location} onChange={(location) => set({ location })} maxLength={160} />
      <Row>
        <Field label="Start" value={item.startDate} onChange={(startDate) => set({ startDate })} placeholder="Mar 2022" maxLength={40} />
        <Field label="End" value={item.endDate} onChange={(endDate) => set({ endDate })} placeholder="Present" maxLength={40} />
      </Row>
    </>
  );
}

const experienceLabel = (item: { title: string; organization: string }, index: number) =>
  [item.title, item.organization].filter((s) => s.trim()).join(' · ') || `Role ${index + 1}`;

export function ExperienceList({ items, onChange }: { items: Experience[]; onChange(items: Experience[]): void }) {
  return (
    <ItemList<Experience>
      items={items}
      onChange={onChange}
      addLabel="Add a role"
      emptyText="No roles yet. List them from most recent to oldest."
      itemLabel={experienceLabel}
      create={() => ({ id: newId(), title: '', organization: '', location: '', startDate: '', endDate: '', responsibilities: [], achievements: [] })}
      render={(item, update) => (
        <>
          <ExperienceHeader item={item} update={update} />
          <ListText mode="lines" label="Responsibilities" value={item.responsibilities} onChange={(responsibilities) => update({ responsibilities })} />
          <ListText mode="lines" label="Achievements" value={item.achievements} onChange={(achievements) => update({ achievements })} hint="One per line. Include real figures where you have them." />
        </>
      )}
    />
  );
}

export function CvExperienceList({ items, onChange }: { items: CvExperience[]; onChange(items: CvExperience[]): void }) {
  return (
    <ItemList<CvExperience>
      items={items}
      onChange={onChange}
      addLabel="Add a role"
      emptyText="No roles on this CV."
      itemLabel={experienceLabel}
      create={() => ({ id: newId(), title: '', organization: '', location: '', startDate: '', endDate: '', bullets: [] })}
      render={(item, update) => (
        <>
          <ExperienceHeader item={item} update={update} />
          <ListText mode="lines" label="Bullet points" value={item.bullets} onChange={(bullets) => update({ bullets })} />
        </>
      )}
    />
  );
}

// ---------- the rest ----------

export function EducationList({ items, onChange }: { items: Education[]; onChange(items: Education[]): void }) {
  return (
    <ItemList
      items={items}
      onChange={onChange}
      addLabel="Add education"
      emptyText="No education added."
      itemLabel={(item, i) => or(item.qualification, `Education ${i + 1}`)}
      create={() => ({ id: newId(), qualification: '', institution: '', location: '', startDate: '', endDate: '', details: '' })}
      render={(item, update) => (
        <>
          <Field label="Qualification" value={item.qualification} onChange={(qualification) => update({ qualification })} placeholder="BSc Computer Science" maxLength={200} />
          <Field label="Institution" value={item.institution} onChange={(institution) => update({ institution })} maxLength={200} />
          <Field label="Location" value={item.location} onChange={(location) => update({ location })} maxLength={160} />
          <Row>
            <Field label="Start" value={item.startDate} onChange={(startDate) => update({ startDate })} maxLength={40} />
            <Field label="End" value={item.endDate} onChange={(endDate) => update({ endDate })} maxLength={40} />
          </Row>
          <TextArea label="Details (optional)" rows={2} value={item.details} onChange={(details) => update({ details })} hint="Grade, honours, relevant modules." maxLength={600} />
        </>
      )}
    />
  );
}

export function CertificationList({ items, onChange }: { items: Certification[]; onChange(items: Certification[]): void }) {
  return (
    <ItemList
      items={items}
      onChange={onChange}
      addLabel="Add certification or training"
      emptyText="No certifications added."
      itemLabel={(item, i) => or(item.name, `Certification ${i + 1}`)}
      create={() => ({ id: newId(), name: '', issuer: '', date: '' })}
      render={(item, update) => (
        <>
          <Field label="Name" value={item.name} onChange={(name) => update({ name })} maxLength={200} />
          <Row>
            <Field label="Issuer" value={item.issuer} onChange={(issuer) => update({ issuer })} maxLength={200} />
            <Field label="Date" value={item.date} onChange={(date) => update({ date })} placeholder="2024" maxLength={40} />
          </Row>
        </>
      )}
    />
  );
}

export function ProjectList({ items, onChange }: { items: Project[]; onChange(items: Project[]): void }) {
  return (
    <ItemList
      items={items}
      onChange={onChange}
      addLabel="Add a project"
      emptyText="No projects added."
      itemLabel={(item, i) => or(item.name, `Project ${i + 1}`)}
      create={() => ({ id: newId(), name: '', description: '', technologies: [], link: '' })}
      render={(item, update) => (
        <>
          <Field label="Project name" value={item.name} onChange={(name) => update({ name })} maxLength={200} />
          <TextArea label="Description" rows={3} value={item.description} onChange={(description) => update({ description })} maxLength={1500} />
          <ListText mode="commas" label="Tools, skills or technologies used" rows={2} value={item.technologies} onChange={(technologies) => update({ technologies })} />
          <Field label="Link (optional)" inputMode="url" value={item.link} onChange={(link) => update({ link })} maxLength={300} />
        </>
      )}
    />
  );
}

export function VolunteerList({ items, onChange }: { items: Volunteer[]; onChange(items: Volunteer[]): void }) {
  return (
    <ItemList
      items={items}
      onChange={onChange}
      addLabel="Add volunteer experience"
      emptyText="No volunteer experience added."
      itemLabel={(item, i) => [item.role, item.organization].filter((s) => s.trim()).join(' · ') || `Volunteer role ${i + 1}`}
      create={() => ({ id: newId(), role: '', organization: '', startDate: '', endDate: '', description: '' })}
      render={(item, update) => (
        <>
          <Field label="Role" value={item.role} onChange={(role) => update({ role })} maxLength={160} />
          <Field label="Organization" value={item.organization} onChange={(organization) => update({ organization })} maxLength={160} />
          <Row>
            <Field label="Start" value={item.startDate} onChange={(startDate) => update({ startDate })} maxLength={40} />
            <Field label="End" value={item.endDate} onChange={(endDate) => update({ endDate })} maxLength={40} />
          </Row>
          <TextArea label="Description" rows={3} value={item.description} onChange={(description) => update({ description })} maxLength={1000} />
        </>
      )}
    />
  );
}

export function LanguageList({ items, onChange }: { items: Language[]; onChange(items: Language[]): void }) {
  return (
    <ItemList
      items={items}
      onChange={onChange}
      addLabel="Add a language"
      emptyText="No languages added."
      itemLabel={(item, i) => or(item.name, `Language ${i + 1}`)}
      create={() => ({ id: newId(), name: '', proficiency: '' })}
      render={(item, update) => (
        <Row>
          <Field label="Language" value={item.name} onChange={(name) => update({ name })} maxLength={80} />
          <Field label="Proficiency" value={item.proficiency} onChange={(proficiency) => update({ proficiency })} placeholder="Fluent" maxLength={80} />
        </Row>
      )}
    />
  );
}
