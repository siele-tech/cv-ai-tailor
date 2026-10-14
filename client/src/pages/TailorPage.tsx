import { useEffect, useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { Button, Card, ConfirmDialog, EmptyState, Field, LoadingBlock, Notice, PageTitle, TextArea } from '../components/ui';
import { WorkingCard } from '../components/WorkingCard';

const TAILOR_STEPS = [
  'Reading the job description',
  'Finding your most relevant experience',
  'Rewriting your summary and bullet points',
  'Checking every claim against your master CV',
  'Scoring how well you match',
];

/** Let the user know the CV is ready even if they switched to another app while waiting. */
function announceReady() {
  try {
    navigator.vibrate?.([80, 60, 80]);
  } catch {
    // vibration is optional
  }
  if (document.hidden) {
    const original = document.title;
    document.title = 'Your CV is ready - CV Tailor AI';
    const restore = () => {
      if (!document.hidden) {
        document.title = original;
        document.removeEventListener('visibilitychange', restore);
      }
    };
    document.addEventListener('visibilitychange', restore);
  }
}
import { useDraft, useSession, useToast } from '../state';
import { EMPHASES, type Emphasis, type Job } from '../types';

const FORM_KEY = 'cvt_job_form';
const MIN_DESCRIPTION = 40;
const MAX_DESCRIPTION = 20_000;

const blankJob = (): Job => ({ title: '', company: '', description: '', url: '', emphasis: 'General', instructions: '' });

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
      const result = await api.tailor({ ...job, title: job.title.trim(), company: job.company.trim(), description: job.description.trim(), url: job.url.trim(), instructions: job.instructions.trim() });
      setDraft({ ...result, dirty: false, fresh: true });
      announceReady();
      sessionStorage.removeItem(FORM_KEY);
      if (result.generatedBy !== 'ai') toast('info', 'Demo CV ready (no AI was used).');
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
        <Field label="Job title" value={job.title} onChange={(title) => set({ title })} error={errors.title} placeholder="e.g. Accountant, Nurse, Sales Executive" maxLength={160} />
        <Field label="Company" value={job.company} onChange={(company) => set({ company })} placeholder="e.g. City Hospital" maxLength={160} />
        <div>
          <label htmlFor={emphasisId} className="mb-1.5 block text-sm font-medium text-slate-700">
            Industry or field
          </label>
          <input
            id={emphasisId}
            list={`${emphasisId}-options`}
            value={job.emphasis}
            maxLength={80}
            onChange={(e) => set({ emphasis: e.target.value as Emphasis })}
            onFocus={(e) => e.target.select()}
            placeholder="e.g. Healthcare & Nursing"
            className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-slate-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          />
          <datalist id={`${emphasisId}-options`}>
            {EMPHASES.map((emphasis) => (
              <option key={emphasis} value={emphasis} />
            ))}
          </datalist>
          <p className="mt-1 text-xs text-slate-500">Pick a suggestion or type your own.</p>
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
        <TextArea
          label="Instructions for the AI (optional)"
          rows={3}
          value={job.instructions}
          onChange={(instructions) => set({ instructions })}
          placeholder="e.g. Keep it to one page. Emphasise my customer service. I also trained new staff at my current job."
          hint="Style, emphasis, or true facts about you that are not in your master CV yet."
          maxLength={2000}
        />
        <Field label="Job posting link (optional)" inputMode="url" value={job.url} onChange={(url) => set({ url })} hint="Saved for your reference only. The page is not opened or read." maxLength={600} />
      </Card>

      {failure && (
        <Notice kind="error" title="The CV could not be generated">
          {failure}
        </Notice>
      )}

      {busy ? (
        <WorkingCard title="Tailoring your CV" steps={TAILOR_STEPS} hint={status?.aiConfigured ? 'usually 15–60 seconds' : undefined} stepSeconds={status?.aiConfigured ? 7 : 1} />
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
