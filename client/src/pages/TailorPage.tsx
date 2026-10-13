import { useEffect, useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { Button, Card, ConfirmDialog, EmptyState, Field, LoadingBlock, Notice, PageTitle, Progress, TextArea } from '../components/ui';
import { useDraft, useSession, useToast } from '../state';
import { EMPHASES, type Emphasis, type Job } from '../types';

const FORM_KEY = 'cvt_job_form';
const MIN_DESCRIPTION = 40;
const MAX_DESCRIPTION = 20_000;

const blankJob = (): Job => ({ title: '', company: '', description: '', url: '', emphasis: 'General IT' });

function readForm(): Job {
  try {
    const raw = sessionStorage.getItem(FORM_KEY);
    return raw ? { ...blankJob(), ...(JSON.parse(raw) as Partial<Job>) } : blankJob();
  } catch {
    return blankJob();
  }
}

export function TailorPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { status } = useSession();
  const { draft, setDraft } = useDraft();
  const emphasisId = useId();

  const [job, setJob] = useState<Job>(readForm);
  const [profileReady, setProfileReady] = useState<boolean | null>(null);
  const [errors, setErrors] = useState<{ title?: string; description?: string }>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [confirmReplace, setConfirmReplace] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .dashboard()
      .then((d) => !cancelled && setProfileReady(d.profile.usable))
      .catch(() => !cancelled && setProfileReady(true)); // let the server decide on submit
    return () => {
      cancelled = true;
    };
  }, []);

  // Survives switching apps to copy the job advert, which can make Android reload the tab.
  useEffect(() => {
    try {
      sessionStorage.setItem(FORM_KEY, JSON.stringify(job));
    } catch {
      // not critical
    }
  }, [job]);

  const set = (patch: Partial<Job>) => setJob((current) => ({ ...current, ...patch }));
  const length = job.description.trim().length;

  function validate(): boolean {
    const next: typeof errors = {};
    if (!job.title.trim()) next.title = 'Enter the job title.';
    if (length < MIN_DESCRIPTION) next.description = 'Paste the full job description (at least a few sentences).';
    if (length > MAX_DESCRIPTION) next.description = `The description is too long. Keep it under ${MAX_DESCRIPTION.toLocaleString()} characters.`;
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function generate() {
    setConfirmReplace(false);
    setBusy(true);
    setFailure('');
    try {
      const result = await api.tailor({ ...job, title: job.title.trim(), company: job.company.trim(), description: job.description.trim(), url: job.url.trim() });
      setDraft({ ...result, dirty: false });
      sessionStorage.removeItem(FORM_KEY);
      toast('success', result.generatedBy === 'ai' ? 'Your tailored CV is ready.' : 'Demo CV ready (no AI was used).');
      navigate('/cv/new');
    } catch (err) {
      setFailure(errorMessage(err));
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    if (draft && (!draft.id || draft.dirty)) setConfirmReplace(true);
    else void generate();
  }

  if (profileReady === null) return <LoadingBlock />;
  if (!profileReady) {
    return (
      <EmptyState
        icon="user"
        title="Add your master CV first"
        action={
          <Button variant="primary" className="w-full" onClick={() => navigate('/profile')}>
            Go to Master CV
          </Button>
        }
      >
        A tailored CV is built from your real experience, so your master CV needs at least some experience, skills or education.
      </EmptyState>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <PageTitle title="Tailor my CV" subtitle="Paste the job advert. Only facts from your master CV are used." />

      {status && !status.aiConfigured && (
        <Notice kind="warn" title="Demo mode: no AI key configured">
          The CV will be assembled from your master CV by simple keyword matching, without rewriting. Add an AI API key on the server for real tailoring (see Settings).
        </Notice>
      )}

      <Card className="space-y-4">
        <Field label="Job title" value={job.title} onChange={(title) => set({ title })} error={errors.title} placeholder="e.g. Backend Engineer" maxLength={160} />
        <Field label="Company" value={job.company} onChange={(company) => set({ company })} placeholder="e.g. Acme Bank" maxLength={160} />
        <div>
          <label htmlFor={emphasisId} className="mb-1.5 block text-sm font-medium text-slate-700">
            CV emphasis
          </label>
          <select
            id={emphasisId}
            value={job.emphasis}
            onChange={(e) => set({ emphasis: e.target.value as Emphasis })}
            className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          >
            {EMPHASES.map((emphasis) => (
              <option key={emphasis}>{emphasis}</option>
            ))}
          </select>
        </div>
        <TextArea
          label="Job description"
          rows={10}
          value={job.description}
          onChange={(description) => set({ description })}
          error={errors.description}
          placeholder="Paste the full job description here…"
          hint={`${length.toLocaleString()} / ${MAX_DESCRIPTION.toLocaleString()} characters`}
        />
        <Field label="Job posting link (optional)" inputMode="url" value={job.url} onChange={(url) => set({ url })} hint="Saved for your reference only. The page is not opened or read." maxLength={600} />
      </Card>

      {failure && (
        <Notice kind="error" title="The CV could not be generated">
          {failure}
        </Notice>
      )}

      {busy ? (
        <Progress label="Analysing the job and tailoring your CV…" hint={status?.aiConfigured ? 'This usually takes 15 to 60 seconds. Keep this page open.' : undefined} />
      ) : (
        <Button type="submit" variant="primary" size="lg" icon="sparkles" className="w-full">
          Tailor My CV
        </Button>
      )}

      <ConfirmDialog open={confirmReplace} title="Replace your unsaved CV?" confirmLabel="Continue" onCancel={() => setConfirmReplace(false)} onConfirm={() => void generate()}>
        The CV you have open{draft ? ` for “${draft.job.title}”` : ''} has changes that are not saved to your history. Generating a new one will discard them.
      </ConfirmDialog>
    </form>
  );
}
