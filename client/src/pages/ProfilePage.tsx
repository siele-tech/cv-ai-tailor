import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { api, errorMessage } from '../api';
import {
  CertificationList,
  ContactFields,
  EducationList,
  ExperienceList,
  LanguageList,
  ProjectList,
  Section,
  SkillsFields,
  VolunteerList,
} from '../components/editors';
import { StructureSettings } from '../components/LayoutEditor';
import { Button, Card, ConfirmDialog, LoadingBlock, Notice, PageTitle, Progress, TextArea } from '../components/ui';
import { useSession, useToast } from '../state';
import { emptyProfile, type ExtractResult, type Profile } from '../types';

/** True when every field of a list item (other than its id) is empty. */
function isBlank(item: object): boolean {
  return Object.entries(item).every(([key, value]) => key === 'id' || (Array.isArray(value) ? value.length === 0 : !String(value).trim()));
}

function tidy(profile: Profile): Profile {
  const keep = <T extends object>(items: T[]) => items.filter((item) => !isBlank(item));
  return {
    ...profile,
    experience: keep(profile.experience),
    education: keep(profile.education),
    certifications: keep(profile.certifications),
    projects: keep(profile.projects),
    volunteer: keep(profile.volunteer),
    languages: keep(profile.languages),
  };
}

const hasContent = (profile: Profile) => JSON.stringify(tidy(profile)) !== JSON.stringify(emptyProfile());

export function ProfilePage() {
  const toast = useToast();
  const { status } = useSession();
  const fileInput = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [savedJson, setSavedJson] = useState('');
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState<ExtractResult | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [nameError, setNameError] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  // Remounts the form after a wholesale replacement so collapsed sections show fresh data.
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .getProfile()
      .then(({ profile: loaded }) => {
        if (cancelled) return;
        const value = loaded ?? emptyProfile();
        setProfile(value);
        setSavedJson(loaded ? JSON.stringify(value) : '');
      })
      .catch((err) => !cancelled && setLoadError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = useMemo(() => profile !== null && JSON.stringify(profile) !== (savedJson || JSON.stringify(emptyProfile())), [profile, savedJson]);

  // Warn before a refresh or tab close throws away unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (loadError) return <Notice kind="error" title="Could not load your master CV">{loadError}</Notice>;
  if (!profile) return <LoadingBlock />;

  const maxMb = status?.maxUploadMb ?? 5;
  const set = (patch: Partial<Profile>) => setProfile({ ...profile, ...patch });

  function replaceForm(next: Profile) {
    setProfile(next);
    setFormKey((k) => k + 1);
    setNameError('');
  }

  async function extract(file: File) {
    setPendingFile(null);
    setExtracting(true);
    setUploadError('');
    setExtracted(null);
    try {
      const result = await api.extractProfile(file);
      replaceForm(result.profile);
      setExtracted(result);
      toast('success', 'CV read. Review the details, then save.');
    } catch (err) {
      setUploadError(errorMessage(err));
    } finally {
      setExtracting(false);
    }
  }

  function onFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow choosing the same file again
    if (!file) return;
    setUploadError('');
    if (!/\.(pdf|docx)$/i.test(file.name)) return setUploadError('Unsupported file type. Please choose a PDF or DOCX file.');
    if (file.size === 0) return setUploadError('That file is empty.');
    if (file.size > maxMb * 1024 * 1024) return setUploadError(`That file is larger than ${maxMb} MB. Please choose a smaller one.`);
    if (hasContent(profile!)) setPendingFile(file);
    else void extract(file);
  }

  async function loadSample() {
    try {
      const { profile: sample } = await api.sampleProfile();
      replaceForm(sample);
      toast('info', 'Sample data loaded. It is fictional: replace it with your own before applying anywhere.');
    } catch (err) {
      toast('error', errorMessage(err));
    }
  }

  async function save() {
    const cleaned = tidy(profile!);
    if (!cleaned.contact.fullName.trim()) {
      setNameError('Your full name is required.');
      toast('error', 'Add your full name before saving.');
      return;
    }
    setSaving(true);
    try {
      const { profile: saved } = await api.saveProfile(cleaned);
      setProfile(saved);
      setSavedJson(JSON.stringify(saved));
      setExtracted(null);
      toast('success', 'Master CV saved.');
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageTitle title="Master CV" subtitle="Your complete, truthful record. Tailored CVs are built from this and never change it." />

      <Card>
        <h2 className="font-semibold text-slate-900">Upload your CV</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          PDF or DOCX, up to {maxMb} MB. The file is read once to fill in the form below and is not stored.
        </p>
        <input ref={fileInput} type="file" className="sr-only" tabIndex={-1} aria-hidden="true" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={onFileChosen} />
        <div className="mt-3 space-y-3">
          {extracting ? (
            <Progress
              label="Reading your CV…"
              hint={status?.aiConfigured ? 'Extracting your experience, education and skills. This can take up to a minute.' : 'Extracting text with the basic reader.'}
            />
          ) : (
            <Button variant={savedJson ? 'secondary' : 'primary'} icon="upload" className="w-full" onClick={() => fileInput.current?.click()}>
              {savedJson ? 'Upload a new CV' : 'Choose PDF or DOCX'}
            </Button>
          )}
          {uploadError && <Notice kind="error">{uploadError}</Notice>}
          {!savedJson && !extracting && !hasContent(profile) && (
            <p className="text-center text-sm text-slate-600">
              Or fill in the form below, or{' '}
              <button type="button" onClick={loadSample} className="font-semibold text-brand-700 underline underline-offset-2">
                load sample data
              </button>{' '}
              to try the app.
            </p>
          )}
        </div>
      </Card>

      <Section title="CV structure">
        <StructureSettings />
      </Section>

      {extracted && (
        <Notice kind={extracted.method === 'ai' ? 'info' : 'warn'} title={extracted.method === 'ai' ? 'Review what was extracted' : 'Extracted with the basic reader'}>
          <p>Nothing has been saved yet. Check every section, correct anything that is wrong, then press Save.</p>
          {extracted.warnings.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {extracted.warnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          )}
        </Notice>
      )}

      <div key={formKey} className="space-y-3">
        <Section title="Contact details" defaultOpen>
          <ContactFields value={profile.contact} onChange={(contact) => { set({ contact }); if (contact.fullName.trim()) setNameError(''); }} />
          {nameError && <p className="text-sm font-medium text-red-700">{nameError}</p>}
        </Section>
        <Section title="Professional summary" defaultOpen={Boolean(profile.summary)}>
          <TextArea label="Summary" rows={5} value={profile.summary} onChange={(summary) => set({ summary })} maxLength={3000} hint="A few sentences about who you are professionally." />
        </Section>
        <Section title="Employment history" count={profile.experience.length} defaultOpen={profile.experience.length > 0}>
          <ExperienceList items={profile.experience} onChange={(experience) => set({ experience })} />
        </Section>
        <Section title="Skills" count={profile.skills.technical.length + profile.skills.soft.length} defaultOpen={profile.skills.technical.length > 0}>
          <SkillsFields value={profile.skills} onChange={(skills) => set({ skills })} />
        </Section>
        <Section title="Education" count={profile.education.length}>
          <EducationList items={profile.education} onChange={(education) => set({ education })} />
        </Section>
        <Section title="Certifications and training" count={profile.certifications.length}>
          <CertificationList items={profile.certifications} onChange={(certifications) => set({ certifications })} />
        </Section>
        <Section title="Projects" count={profile.projects.length}>
          <ProjectList items={profile.projects} onChange={(projects) => set({ projects })} />
        </Section>
        <Section title="Volunteer experience" count={profile.volunteer.length}>
          <VolunteerList items={profile.volunteer} onChange={(volunteer) => set({ volunteer })} />
        </Section>
        <Section title="Languages" count={profile.languages.length}>
          <LanguageList items={profile.languages} onChange={(languages) => set({ languages })} />
        </Section>
      </div>

      {/* Sticky save bar, above the bottom navigation */}
      <div className="fixed inset-x-0 bottom-16 z-20 mb-[env(safe-area-inset-bottom)] border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2.5">
          <p className="flex-1 text-sm text-slate-600">{dirty ? 'You have unsaved changes.' : savedJson ? 'All changes saved.' : 'Not saved yet.'}</p>
          <Button variant="primary" icon="save" onClick={save} loading={saving} disabled={!dirty && Boolean(savedJson)}>
            {saving ? 'Saving…' : 'Save master CV'}
          </Button>
        </div>
      </div>
      <div className="h-16" aria-hidden="true" />

      <ConfirmDialog
        open={pendingFile !== null}
        title="Replace the form with this CV?"
        confirmLabel="Replace"
        onCancel={() => setPendingFile(null)}
        onConfirm={() => pendingFile && void extract(pendingFile)}
      >
        The details currently in the form will be replaced by what is read from <strong>{pendingFile?.name}</strong>. Your saved master CV only changes when you press Save.
      </ConfirmDialog>
    </div>
  );
}
