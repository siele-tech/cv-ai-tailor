import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage, saveBlob } from '../api';
import { AnalysisPanel } from '../components/AnalysisPanel';
import { CvPreview } from '../components/CvPreview';
import {
  CertificationList,
  ContactFields,
  CvExperienceList,
  EducationList,
  LanguageList,
  ProjectList,
  Section,
  SkillsFields,
  VolunteerList,
} from '../components/editors';
import { Button, EmptyState, Field, Icon, LoadingBlock, Notice, TextArea, type IconName } from '../components/ui';
import { useDraft, useToast } from '../state';
import type { CvContent, Job } from '../types';

type Tab = 'preview' | 'edit' | 'match';
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'preview', label: 'Preview', icon: 'eye' },
  { id: 'edit', label: 'Edit', icon: 'edit' },
  { id: 'match', label: 'Job match', icon: 'chart' },
];

export function CvPage() {
  const { id = 'new' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { draft, setDraft, editDraft } = useDraft();

  const [tab, setTab] = useState<Tab>('preview');
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState<'pdf' | 'save' | 'summary' | null>(null);
  const [summaryNote, setSummaryNote] = useState<string[]>([]);
  // Remounts the editor when its content is replaced from outside (a regenerated summary).
  const [editorKey, setEditorKey] = useState(0);

  const isNew = id === 'new';
  const ready = draft !== null && (isNew ? true : draft.id === id);

  // Opening a saved version from history or the dashboard.
  useEffect(() => {
    if (isNew || draft?.id === id) return;
    let cancelled = false;
    setLoadError('');
    api
      .getVersion(id)
      .then(({ version }) => {
        if (cancelled) return;
        const { createdAt: _c, updatedAt: _u, ...rest } = version;
        setDraft({ ...rest, dirty: false });
      })
      .catch((err) => !cancelled && setLoadError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Warn before a refresh or tab close discards work that is not in the history yet.
  const unsaved = ready && (!draft.id || draft.dirty);
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  if (loadError) {
    return (
      <div className="space-y-3">
        <Notice kind="error" title="This CV could not be opened">
          {loadError}
        </Notice>
        <Button onClick={() => navigate('/history')}>Back to history</Button>
      </div>
    );
  }
  if (!ready) {
    if (!isNew) return <LoadingBlock label="Opening CV…" />;
    return (
      <EmptyState
        icon="sparkles"
        title="No CV open"
        action={
          <Button variant="primary" className="w-full" onClick={() => navigate('/tailor')}>
            Create Tailored CV
          </Button>
        }
      >
        Paste a job description to generate a tailored CV, or open a saved one from your history.
      </EmptyState>
    );
  }

  const { content, job } = draft;
  const setContent = (patch: Partial<CvContent>) => editDraft((d) => ({ ...d, content: { ...d.content, ...patch } }));
  const setJob = (patch: Partial<Job>) => editDraft((d) => ({ ...d, job: { ...d.job, ...patch } }));

  async function downloadPdf() {
    setBusy('pdf');
    try {
      // Always rendered from what is on screen right now, saved or not.
      const { blob, filename } = await api.pdf(draft!.content, draft!.job.title, draft!.job.company);
      saveBlob(blob, filename);
      toast('success', `Downloaded ${filename}`);
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function saveVersion() {
    if (!draft!.job.title.trim()) {
      setTab('edit');
      return toast('error', 'Add a job title before saving.');
    }
    setBusy('save');
    try {
      const { id: existingId, dirty: _dirty, ...body } = draft!;
      const { version } = existingId ? await api.updateVersion(existingId, body) : await api.createVersion(body);
      const { createdAt: _c, updatedAt: _u, ...rest } = version;
      setDraft({ ...rest, dirty: false });
      toast('success', existingId ? 'Changes saved.' : 'Saved to your history.');
      if (!existingId) navigate(`/cv/${version.id}`, { replace: true });
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function regenerateSummary() {
    setBusy('summary');
    setSummaryNote([]);
    try {
      const result = await api.regenerateSummary(draft!.job, draft!.content.summary);
      setContent({ summary: result.summary });
      setEditorKey((k) => k + 1);
      setSummaryNote(result.warnings);
      toast(result.generatedBy === 'ai' ? 'success' : 'info', result.generatedBy === 'ai' ? 'Summary regenerated.' : 'Demo mode: summary reset to your master CV.');
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const saveState = !draft.id ? 'Not saved' : draft.dirty ? 'Unsaved changes' : 'Saved';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl leading-snug font-bold tracking-tight text-slate-900">{job.title || 'Untitled role'}</h1>
        <p className="text-[15px] text-slate-600">{job.company || 'Company not specified'}</p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-medium">
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-brand-800">{job.emphasis}</span>
          <span className={`rounded-full px-2.5 py-1 ${draft.generatedBy === 'ai' ? 'bg-slate-100 text-slate-700' : 'bg-amber-100 text-amber-900'}`}>
            {draft.generatedBy === 'ai' ? `AI-generated${draft.aiModel ? ` (${draft.aiModel})` : ''}` : 'Demo output, no AI used'}
          </span>
          <span className={`rounded-full px-2.5 py-1 ${saveState === 'Saved' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>{saveState}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Button variant="primary" icon="download" onClick={downloadPdf} loading={busy === 'pdf'} disabled={busy !== null}>
          Download PDF
        </Button>
        <Button icon="save" onClick={saveVersion} loading={busy === 'save'} disabled={busy !== null || (Boolean(draft.id) && !draft.dirty)}>
          {draft.id ? 'Save changes' : 'Save version'}
        </Button>
        <Button icon="refresh" size="sm" onClick={regenerateSummary} loading={busy === 'summary'} disabled={busy !== null}>
          Regenerate summary
        </Button>
        <Button icon="plus" size="sm" onClick={() => navigate('/tailor')} disabled={busy !== null}>
          Create another
        </Button>
      </div>

      {summaryNote.length > 0 && (
        <Notice kind="warn">
          {summaryNote.map((note, i) => (
            <p key={i}>{note}</p>
          ))}
        </Notice>
      )}

      <div role="tablist" aria-label="CV views" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-200/70 p-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`flex min-h-11 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold ${tab === item.id ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-600'}`}
          >
            <Icon name={item.icon} className="h-4 w-4" />
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'preview' && (
        <div className="space-y-3">
          <CvPreview content={content} />
          <p className="text-center text-xs text-slate-500">
            The PDF uses this content and order. Switch to <button type="button" className="font-semibold text-brand-700 underline" onClick={() => setTab('edit')}>Edit</button> to change anything.
          </p>
        </div>
      )}

      {tab === 'edit' && (
        <div key={editorKey} className="space-y-3">
          <Notice>Edits apply to this CV only. Your master CV and other saved versions are not changed.</Notice>
          <Section title="Application details">
            <Field label="Job title" value={job.title} onChange={(title) => setJob({ title })} maxLength={160} />
            <Field label="Company" value={job.company} onChange={(company) => setJob({ company })} maxLength={160} />
          </Section>
          <Section title="Professional summary" defaultOpen>
            <TextArea label="Summary" rows={6} value={content.summary} onChange={(summary) => setContent({ summary })} maxLength={3000} />
          </Section>
          <Section title="Skills" count={content.skills.technical.length + content.skills.soft.length}>
            <SkillsFields value={content.skills} onChange={(skills) => setContent({ skills })} />
          </Section>
          <Section title="Experience" count={content.experience.length} defaultOpen>
            <CvExperienceList items={content.experience} onChange={(experience) => setContent({ experience })} />
          </Section>
          <Section title="Projects" count={content.projects.length}>
            <ProjectList items={content.projects} onChange={(projects) => setContent({ projects })} />
          </Section>
          <Section title="Education" count={content.education.length}>
            <EducationList items={content.education} onChange={(education) => setContent({ education })} />
          </Section>
          <Section title="Certifications and training" count={content.certifications.length}>
            <CertificationList items={content.certifications} onChange={(certifications) => setContent({ certifications })} />
          </Section>
          <Section title="Volunteer experience" count={content.volunteer.length}>
            <VolunteerList items={content.volunteer} onChange={(volunteer) => setContent({ volunteer })} />
          </Section>
          <Section title="Languages" count={content.languages.length}>
            <LanguageList items={content.languages} onChange={(languages) => setContent({ languages })} />
          </Section>
          <Section title="Contact details">
            <ContactFields value={content.contact} onChange={(contact) => setContent({ contact })} />
          </Section>
          <Button variant="primary" icon="eye" className="w-full" onClick={() => { setTab('preview'); window.scrollTo(0, 0); }}>
            Preview changes
          </Button>
        </div>
      )}

      {tab === 'match' && <AnalysisPanel analysis={draft.analysis} generatedBy={draft.generatedBy} />}

      <p className="pt-2 text-center text-sm">
        <Link to="/" className="font-medium text-brand-700 underline underline-offset-2">
          Back to dashboard
        </Link>
      </p>
    </div>
  );
}
