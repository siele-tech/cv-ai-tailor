import { useState, type ReactNode } from 'react';
import { api, errorMessage, saveBlob } from '../api';
import { notifyIfHidden } from '../notify';
import { useToast } from '../state';
import { STATUS_OPTIONS, type Application, type Draft, type InterviewPrep, type LetterTone, type LinkedinProfile } from '../types';
import { Button, Card, Icon, Notice, type IconName } from './ui';
import { CopyLink } from './CopyLink';
import { WorkingCard } from './WorkingCard';

function Panel({ icon, title, tint, children }: { icon: IconName; title: string; tint: string; children: ReactNode }) {
  return (
    <Card>
      <div className="mb-3 flex items-center gap-2.5">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tint}`}>
          <Icon name={icon} />
        </span>
        <h2 className="font-bold text-slate-900">{title}</h2>
      </div>
      {children}
    </Card>
  );
}

async function copy(text: string, toast: (kind: 'success' | 'error', text: string) => void, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast('success', `${what} copied.`);
  } catch {
    toast('error', 'Could not copy. Select the text and copy it by hand.');
  }
}

// ---------- application tracker ----------

export function ApplicationCard({ versionId, value, onSaved }: { versionId?: string; value?: Application; onSaved(app: Application): void }) {
  const toast = useToast();
  const [app, setApp] = useState<Application>(value ?? { status: 'not_applied', appliedAt: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const saved = value ?? { status: 'not_applied', appliedAt: '', notes: '' };
  const changed = app.appliedAt !== saved.appliedAt || app.notes !== saved.notes;

  async function save(next = app) {
    if (!versionId) return;
    setBusy(true);
    try {
      const { application } = await api.setApplication(versionId, next);
      onSaved(application);
      toast('success', 'Application updated.');
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel icon="clock" title="Application" tint="bg-sky-100 text-sky-700">
      {!versionId ? (
        <p className="text-sm text-slate-600">Save this CV first (Save version below) to track where your application stands.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  const next = { ...app, status: s.id, appliedAt: s.id === 'applied' && !app.appliedAt ? new Date().toISOString().slice(0, 10) : app.appliedAt };
                  setApp(next);
                  void save(next);
                }}
                aria-pressed={app.status === s.id}
                className={`min-h-10 rounded-full px-3.5 text-sm font-semibold transition ${app.status === s.id ? `${s.tone} ring-2 ring-current/30` : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <label className="block text-sm font-medium text-slate-700">
            Date applied
            <input type="date" value={app.appliedAt} onChange={(e) => setApp({ ...app, appliedAt: e.target.value })} className="mt-1 block h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Notes
            <textarea rows={3} value={app.notes} maxLength={2000} onChange={(e) => setApp({ ...app, notes: e.target.value })} placeholder="Recruiter's name, interview date, follow-up…" className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900" />
          </label>
          {changed && (
            <Button className="w-full" onClick={() => save()} loading={busy}>
              Save date and notes
            </Button>
          )}
        </div>
      )}
    </Panel>
  );
}

// ---------- cover letter ----------

const TONES: { id: LetterTone; label: string }[] = [
  { id: 'professional', label: 'Professional' },
  { id: 'warm', label: 'Warm' },
  { id: 'confident', label: 'Confident' },
  { id: 'concise', label: 'Short' },
];

export function CoverLetterCard({ draft, aiOn, onChange }: { draft: Draft; aiOn: boolean; onChange(letter: string): void }) {
  const toast = useToast();
  const [tone, setTone] = useState<LetterTone>('professional');
  const [busy, setBusy] = useState<'write' | 'pdf' | 'docx' | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const letter = draft.coverLetter ?? '';

  async function write() {
    setBusy('write');
    setWarnings([]);
    try {
      const result = await api.coverLetter(draft.job, draft.content, draft.analysis, tone);
      onChange(result.letter);
      setWarnings(result.warnings);
      notifyIfHidden('Your cover letter is ready', draft.job.title);
      toast('success', 'Cover letter written. Read it through and make it yours.');
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function download(kind: 'pdf' | 'docx') {
    setBusy(kind);
    try {
      const file =
        kind === 'pdf'
          ? await api.letterPdf(letter, draft.content.contact, draft.job.title, draft.job.company, draft.content.design)
          : await api.letterDocx(letter, draft.content.contact, draft.job.title, draft.job.company);
      saveBlob(file.blob, file.filename);
      toast('success', `Downloaded ${file.filename}`);
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel icon="edit" title="Cover letter" tint="bg-violet-100 text-violet-700">
      {!aiOn && !letter ? (
        <Notice kind="warn">Writing a cover letter needs an AI provider.</Notice>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tone">
            {TONES.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={tone === t.id} onClick={() => setTone(t.id)} className={`min-h-9 rounded-full px-3 text-sm font-semibold ${tone === t.id ? 'bg-violet-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>
                {t.label}
              </button>
            ))}
          </div>
          {busy === 'write' ? (
            <WorkingCard title="Writing your cover letter" steps={['Reading the job', 'Choosing your best examples', 'Writing the letter', 'Checking every claim']} hint="usually 10–30 seconds" stepSeconds={5} />
          ) : (
            <Button variant="primary" icon="sparkles" className="w-full" onClick={write} disabled={!aiOn || busy !== null}>
              {letter ? 'Write it again' : 'Write my cover letter'}
            </Button>
          )}
          {warnings.length > 0 && (
            <Notice kind="warn" title="Check before sending">
              {warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </Notice>
          )}
          {letter && (
            <>
              <textarea rows={14} value={letter} onChange={(e) => onChange(e.target.value)} maxLength={8000} aria-label="Cover letter text" className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-[15px] leading-relaxed text-slate-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none" />
              <div className="grid grid-cols-3 gap-2">
                <Button size="sm" icon="download" onClick={() => download('pdf')} loading={busy === 'pdf'} disabled={busy !== null}>
                  PDF
                </Button>
                <Button size="sm" icon="download" onClick={() => download('docx')} loading={busy === 'docx'} disabled={busy !== null}>
                  Word
                </Button>
                <Button size="sm" onClick={() => copy(letter, toast, 'Letter')}>
                  Copy
                </Button>
              </div>
              <p className="text-xs text-slate-500">Saved with this CV when you press Save.</p>
            </>
          )}
        </div>
      )}
    </Panel>
  );
}

// ---------- interview preparation ----------

const CATEGORY: Record<string, string> = { experience: 'Your background', role: 'About the role', behavioural: 'Behavioural', gap: 'About a gap' };

export function InterviewCard({ draft, aiOn, onChange }: { draft: Draft; aiOn: boolean; onChange(prep: InterviewPrep): void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<number | null>(0);
  const prep = draft.interviewPrep;

  async function prepare() {
    setBusy(true);
    try {
      const result = await api.interview(draft.job, draft.content, draft.analysis);
      onChange(result.prep);
      setOpen(0);
      notifyIfHidden('Your interview prep is ready', draft.job.title);
      toast('success', 'Interview questions ready.');
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel icon="chart" title="Interview prep" tint="bg-fuchsia-100 text-fuchsia-700">
      {busy ? (
        <WorkingCard title="Preparing your interview" steps={['Reading the job', 'Predicting likely questions', 'Drafting answers from your experience', 'Planning how to handle gaps']} hint="usually 15–45 seconds" stepSeconds={6} />
      ) : (
        <Button variant={prep ? 'secondary' : 'primary'} icon="sparkles" className="w-full" onClick={prepare} disabled={!aiOn}>
          {prep ? 'Prepare again' : 'Prepare me for the interview'}
        </Button>
      )}
      {!aiOn && !prep && <p className="mt-2 text-sm text-slate-500">Needs an AI provider.</p>}
      {prep && (
        <div className="mt-4 space-y-4">
          <ol className="space-y-2">
            {prep.questions.map((q, i) => (
              <li key={i} className="rounded-xl border border-slate-200 bg-white">
                <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="flex w-full items-start gap-2.5 p-3 text-left">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fuchsia-100 text-xs font-bold text-fuchsia-700">{i + 1}</span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-slate-900">{q.question}</span>
                    <span className="text-xs text-slate-500">{CATEGORY[q.category] ?? q.category}</span>
                  </span>
                  <Icon name="chevron" className={`mt-1 h-4 w-4 text-slate-400 transition-transform ${open === i ? 'rotate-90' : ''}`} />
                </button>
                {open === i && (
                  <div className="space-y-2 border-t border-slate-100 p-3 text-sm leading-relaxed">
                    {q.why && <p className="text-xs text-slate-500">Why they ask: {q.why}</p>}
                    <p className="rounded-lg bg-fuchsia-50/60 p-3 text-slate-800">{q.answer}</p>
                    <p className="text-xs text-slate-500">A suggestion built from your CV. Put it in your own words.</p>
                  </div>
                )}
              </li>
            ))}
          </ol>
          {prep.gaps.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-slate-900">Handling the gaps honestly</h3>
              <ul className="mt-2 space-y-2">
                {prep.gaps.map((g, i) => (
                  <li key={i} className="rounded-xl bg-amber-50 p-3 text-sm">
                    <p className="font-semibold text-amber-900">{g.gap}</p>
                    <p className="mt-0.5 leading-relaxed text-amber-900/90">{g.advice}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {prep.questionsToAsk.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-slate-900">Questions to ask them</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {prep.questionsToAsk.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

// ---------- LinkedIn ----------

export function LinkedinCard({ aiOn, target }: { aiOn: boolean; target: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<LinkedinProfile | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  async function write() {
    setBusy(true);
    try {
      const result = await api.linkedin(target);
      setProfile(result.linkedin);
      setWarnings(result.warnings);
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel icon="user" title="LinkedIn profile" tint="bg-sky-100 text-sky-700">
      <p className="text-sm leading-relaxed text-slate-600">A headline and About section from your master CV, aimed at roles like this one.</p>
      {busy ? (
        <div className="mt-3">
          <WorkingCard title="Writing your LinkedIn profile" steps={['Reading your master CV', 'Writing your headline', 'Writing your About section']} hint="usually 10–20 seconds" stepSeconds={4} />
        </div>
      ) : (
        <Button variant={profile ? 'secondary' : 'primary'} icon="sparkles" className="mt-3 w-full" onClick={write} disabled={!aiOn}>
          {profile ? 'Write again' : 'Write my LinkedIn profile'}
        </Button>
      )}
      {warnings.length > 0 && (
        <div className="mt-3">
          <Notice kind="warn">{warnings.join(' ')}</Notice>
        </div>
      )}
      {profile && (
        <div className="mt-4 space-y-3 text-sm">
          {(
            [
              ['Headline', profile.headline],
              ['About', profile.about],
              ['Skills', profile.skills.join(', ')],
            ] as const
          ).map(([label, text]) => (
            <div key={label} className="rounded-xl bg-sky-50/70 p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-bold tracking-wide text-sky-800 uppercase">{label}</span>
                <button type="button" onClick={() => copy(text, toast, label)} className="text-xs font-semibold text-brand-700">
                  Copy
                </button>
              </div>
              <p className="leading-relaxed whitespace-pre-line text-slate-800">{text}</p>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ---------- share link ----------

export function ShareCard({ versionId, share, onChange }: { versionId?: string; share?: Draft['share']; onChange(share: Draft['share']): void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const link = share?.enabled ? `${window.location.origin}/s/${share.token}` : '';

  async function toggle(on: boolean) {
    if (!versionId) return;
    setBusy(true);
    try {
      if (on) {
        const res = await api.share(versionId);
        onChange({ token: res.token, enabled: true });
        toast('success', 'Link created.');
      } else {
        await api.unshare(versionId);
        onChange(share ? { ...share, enabled: false } : null);
        toast('success', 'Link switched off. It no longer works.');
      }
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setBusy(false);
    }
  }


  return (
    <Panel icon="eye" title="Share by link" tint="bg-emerald-100 text-emerald-700">
      {!versionId ? (
        <p className="text-sm text-slate-600">Save this CV first to share it.</p>
      ) : link ? (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-slate-600">Anyone with this link can view and download the saved version of this CV, including your contact details. Not the job advert or your match.</p>
          <CopyLink link={link} shareTitle="My CV" shareText="Here is my CV:" />
          <Button variant="danger" size="sm" className="w-full" onClick={() => toggle(false)} loading={busy}>
            Switch the link off
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-slate-600">Make a private link to send this CV to a mentor or recruiter. They do not need an account, and you can switch it off any time.</p>
          <Button className="w-full" onClick={() => toggle(true)} loading={busy}>
            Create a link
          </Button>
        </div>
      )}
    </Panel>
  );
}
