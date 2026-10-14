import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage, saveBlob } from '../api';
import { changesBetween, changesFromMaster, describeChanges, type ChangeSet } from '../changes';
import { AiChat } from '../components/AiChat';
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
import { LayoutEditor } from '../components/LayoutEditor';
import { ScoreRing } from '../components/ScoreRing';
import { Button, EmptyState, Field, Icon, LoadingBlock, Notice, TextArea, type IconName } from '../components/ui';
import { WorkingCard } from '../components/WorkingCard';
import { ApplicationCard, CoverLetterCard, InterviewCard, LinkedinCard, ShareCard } from '../components/Extras';
import { notifyIfHidden } from '../notify';
import { useDraft, useSession, useToast } from '../state';
import { DESIGN_OPTIONS, statusOption, type CvContent, type Design, type Job, type Profile } from '../types';

type Tab = 'preview' | 'ai' | 'match' | 'edit' | 'more';
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'preview', label: 'Preview', icon: 'eye' },
  { id: 'ai', label: 'Ask AI', icon: 'sparkles' },
  { id: 'match', label: 'Match', icon: 'chart' },
  { id: 'edit', label: 'Edit', icon: 'edit' },
  { id: 'more', label: 'More', icon: 'plus' },
];

const REFINE_STEPS = ['Reading your instruction', 'Updating your CV', 'Checking every claim against your master CV', 'Re-scoring the match'];

export function CvPage() {
  const { id = 'new' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { draft, setDraft, editDraft } = useDraft();
  const { status } = useSession();
  const chatInput = useRef<HTMLTextAreaElement>(null);
  const top = useRef<HTMLDivElement>(null);

  const [tab, setTab] = useState<Tab>('preview');
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState<'pdf' | 'save' | 'summary' | 'chat' | 'master' | null>(null);
  const [instruction, setInstruction] = useState('');
  // Skills the user just told the AI about that their master CV does not list yet.
  const [newSkills, setNewSkills] = useState<string[]>([]);
  // Skills the user chose not to add to the master CV; do not ask again in this session.
  const declinedSkills = useRef(new Set<string>());
  const [summaryNote, setSummaryNote] = useState<string[]>([]);
  // Remounts the editor when its content is replaced from outside (a regenerated summary).
  const [editorKey, setEditorKey] = useState(0);

  // Making changes visible: what differs from the master CV, or from just before the last AI change.
  const [master, setMaster] = useState<Profile | null>(null);
  const [highlight, setHighlight] = useState(true);
  const [lastChange, setLastChange] = useState<ChangeSet | null>(null);
  const [pages, setPages] = useState<number | null>(null);
  const [fitting, setFitting] = useState(false);
  const [wordBusy, setWordBusy] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    api
      .getProfile()
      .then(({ profile }) => !cancelled && setMaster(profile))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const contentKey = ready ? JSON.stringify(draft.content) : '';
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .pageCount(draft.content)
        .then((res) => !cancelled && setPages(res.pages))
        .catch(() => undefined);
    }, 800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey]);

  // Warn before a refresh or tab close discards work that is not in the history yet.
  const unsaved = ready && (!draft.id || draft.dirty);
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  const fromMaster = useMemo(() => (master && ready ? changesFromMaster(master, draft.content) : null), [master, ready, draft?.content]);

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
  const shownChanges = highlight ? (lastChange ?? fromMaster) : null;

  const goTo = (next: Tab) => {
    setTab(next);
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  function dismissReady() {
    setDraft({ ...draft!, fresh: false });
  }

  async function downloadWord() {
    setWordBusy(true);
    try {
      const { blob, filename } = await api.docx(draft!.content, draft!.job.title, draft!.job.company);
      saveBlob(blob, filename);
      toast('success', `Downloaded ${filename}`);
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setWordBusy(false);
    }
  }

  async function fitToOnePage() {
    setFitting(true);
    const before = draft!;
    try {
      const result = await api.onePage(before.job, before.content, before.analysis);
      const diff = changesBetween(before.content, result.content);
      setDraft({
        ...before,
        content: result.content,
        analysis: result.analysis,
        chat: [...(before.chat ?? []), { from: 'you', text: 'Fit my CV on one page' }, { from: 'ai', text: result.reply }],
        dirty: true,
        fresh: false,
      });
      setPages(result.pages);
      setLastChange(diff);
      setHighlight(true);
      setEditorKey((k) => k + 1);
      toast(result.pages <= 1 ? 'success' : 'info', result.reply);
      notifyIfHidden(result.pages <= 1 ? 'Your CV now fits on one page' : 'Your CV was shortened', before.job.title);
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setFitting(false);
    }
  }

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
      const { id: existingId, dirty: _dirty, chat: _chat, fresh: _fresh, application: _app, share: _share, ...body } = draft!;
      const { version } = existingId ? await api.updateVersion(existingId, body) : await api.createVersion(body);
      const { createdAt: _c, updatedAt: _u, ...rest } = version;
      setDraft({ ...rest, chat: draft!.chat, dirty: false });
      setPages(null);
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
    const before = draft!.content;
    try {
      const result = await api.regenerateSummary(draft!.job, draft!.content.summary);
      const after = { ...before, summary: result.summary };
      setContent({ summary: result.summary });
      setLastChange(changesBetween(before, after));
      setHighlight(true);
      setEditorKey((k) => k + 1);
      setSummaryNote(result.warnings);
      toast(result.generatedBy === 'ai' ? 'success' : 'info', result.generatedBy === 'ai' ? 'New summary written. It is highlighted in green.' : 'Demo mode: summary reset to your master CV.');
      goTo('preview');
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function sendInstruction(text = instruction.trim(), returnTo: Tab = 'preview') {
    setBusy('chat');
    const before = draft!;
    try {
      const result = await api.refine(before.job, before.content, text);
      const diff = changesBetween(before.content, result.content);
      const scoreNote =
        Math.round(result.analysis.score) !== Math.round(before.analysis.score)
          ? ` Match: ${Math.round(before.analysis.score)}% → ${Math.round(result.analysis.score)}%.`
          : '';
      setDraft({
        ...before,
        job: result.job,
        content: result.content,
        analysis: result.analysis,
        generatedBy: 'ai',
        aiModel: result.aiModel,
        chat: [...(before.chat ?? []), { from: 'you', text }, { from: 'ai', text: `${result.reply}\n\n${describeChanges(diff)}${scoreNote}` }],
        dirty: true,
        fresh: false,
      });
      setLastChange(diff);
      setHighlight(true);
      setInstruction('');
      setEditorKey((k) => k + 1);
      setNewSkills(result.newSkills.filter((skill) => !declinedSkills.current.has(skill)));
      toast('success', `${describeChanges(diff)}${scoreNote}`);
      notifyIfHidden('Your CV has been updated', describeChanges(diff));
      if (returnTo !== tab) goTo(returnTo);
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  /** Put this CV in the manner of an uploaded sample CV. */
  async function restyleFromSample(file: File) {
    setBusy('chat');
    const before = draft!;
    try {
      const result = await api.restyle(file, before.job, before.content, before.analysis);
      const diff = changesBetween(before.content, result.content);
      setDraft({
        ...before,
        content: result.content,
        analysis: result.analysis,
        generatedBy: result.generatedBy === 'ai' ? 'ai' : before.generatedBy,
        aiModel: result.aiModel || before.aiModel,
        chat: [...(before.chat ?? []), { from: 'you', text: `Put my CV in the manner of ${file.name}` }, { from: 'ai', text: `${result.reply}\n\n${describeChanges(diff)}` }],
        dirty: true,
        fresh: false,
      });
      setLastChange(diff);
      setHighlight(true);
      setEditorKey((k) => k + 1);
      toast('success', 'CV restyled after your sample. Check the preview.');
      goTo('preview');
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  /** Keep a skill the user vouched for, so future CVs can use it too. */
  async function addSkillsToMaster() {
    setBusy('master');
    try {
      const { profile } = await api.getProfile();
      if (!profile) throw new Error('no profile');
      const known = new Set(profile.skills.technical.map((s) => s.toLowerCase()));
      const additions = newSkills.filter((s) => !known.has(s.toLowerCase()));
      const { profile: saved } = await api.saveProfile({ ...profile, skills: { ...profile.skills, technical: [...profile.skills.technical, ...additions] } });
      setMaster(saved);
      toast('success', `Added ${newSkills.join(', ')} to your master CV.`);
      setNewSkills([]);
    } catch (err) {
      toast('error', errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const saveState = !draft.id ? 'Not saved yet' : draft.dirty ? 'Unsaved changes' : 'Saved';
  const aiOn = status?.aiConfigured ?? true;
  const rewritten = fromMaster?.changedBullets.size ?? 0;

  return (
    <div className="space-y-4" ref={top}>
      {/* ---------- job header ---------- */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 via-violet-700 to-fuchsia-700 p-4 text-white shadow-lg shadow-brand-700/20">
        <div className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-wide text-white/70 uppercase">Tailored CV</p>
            <h1 className="mt-0.5 text-xl leading-snug font-extrabold">{job.title || 'Untitled role'}</h1>
            <p className="text-sm text-white/85">{job.company || 'Company not specified'}</p>
          </div>
          <button type="button" onClick={() => goTo('match')} className="rounded-full bg-white p-1 shadow-md" aria-label="Open job match">
            <ScoreRing score={draft.analysis.score} size={74} label={false} />
          </button>
        </div>
        <div className="relative mt-3 flex flex-wrap gap-1.5 text-xs font-semibold">
          <span className="rounded-full bg-white/15 px-2.5 py-1">{job.emphasis}</span>
          <span className="rounded-full bg-white/15 px-2.5 py-1">{draft.generatedBy === 'ai' ? 'AI-tailored' : 'Demo, no AI used'}</span>
          {draft.id && draft.application && draft.application.status !== 'not_applied' && (
            <span className="rounded-full bg-white/90 px-2.5 py-1 text-brand-800">{statusOption(draft.application.status).label}</span>
          )}
          <span className={`rounded-full px-2.5 py-1 ${saveState === 'Saved' ? 'bg-emerald-400/25 text-emerald-50' : 'bg-amber-300/25 text-amber-50'}`}>{saveState}</span>
        </div>
      </div>

      {/* ---------- the "it's ready" moment ---------- */}
      {draft.fresh && (
        <div className="animate-pop overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-white p-4 shadow-md">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-md shadow-emerald-600/30">
              <Icon name="check" className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-extrabold text-emerald-900">Your tailored CV is ready</h2>
              <p className="mt-0.5 text-sm text-emerald-900/80">Built from your master CV for this job. Changes are highlighted in green.</p>
            </div>
            <button type="button" onClick={dismissReady} aria-label="Dismiss" className="-mt-1 -mr-1 flex h-9 w-9 items-center justify-center rounded-full text-emerald-800 hover:bg-emerald-100">
              <Icon name="plus" className="h-5 w-5 rotate-45" />
            </button>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-white p-2 shadow-sm">
              <dt className="text-[11px] font-medium text-slate-500">Match</dt>
              <dd className="text-lg font-extrabold text-slate-900">{Math.round(draft.analysis.score)}%</dd>
            </div>
            <div className="rounded-xl bg-white p-2 shadow-sm">
              <dt className="text-[11px] font-medium text-slate-500">Bullets rewritten</dt>
              <dd className="text-lg font-extrabold text-slate-900">
                {fromMaster ? `${rewritten}/${fromMaster.bulletsTotal}` : '…'}
              </dd>
            </div>
            <div className="rounded-xl bg-white p-2 shadow-sm">
              <dt className="text-[11px] font-medium text-slate-500">Job keywords</dt>
              <dd className="text-lg font-extrabold text-slate-900">{draft.analysis.keywordsIncluded.length}</dd>
            </div>
          </dl>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button size="sm" onClick={() => { dismissReady(); goTo('match'); }}>
              See the match
            </Button>
            <Button size="sm" variant="primary" icon="download" onClick={downloadPdf} loading={busy === 'pdf'} disabled={busy !== null}>
              Download PDF
            </Button>
          </div>
        </div>
      )}

      {summaryNote.length > 0 && (
        <Notice kind="warn">
          {summaryNote.map((note, i) => (
            <p key={i}>{note}</p>
          ))}
        </Notice>
      )}

      {newSkills.length > 0 && (
        <Notice kind="info" title={`Add ${newSkills.join(', ')} to your master CV?`}>
          <p>You told the AI about {newSkills.length === 1 ? 'this skill' : 'these skills'}, so {newSkills.length === 1 ? 'it is' : 'they are'} on this CV. Your master CV does not list {newSkills.length === 1 ? 'it' : 'them'} yet, so future CVs will not know.</p>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <Button size="sm" variant="primary" onClick={addSkillsToMaster} loading={busy === 'master'} disabled={busy !== null}>
              Add to master CV
            </Button>
            <Button
              size="sm"
              onClick={() => {
                newSkills.forEach((skill) => declinedSkills.current.add(skill));
                setNewSkills([]);
              }}
              disabled={busy !== null}
            >
              Not now
            </Button>
          </div>
        </Notice>
      )}

      {/* ---------- tabs ---------- */}
      <div role="tablist" aria-label="CV views" className="sticky top-14 z-20 -mx-1 grid grid-cols-5 gap-1 rounded-2xl border border-white/70 bg-white/85 p-1 shadow-sm backdrop-blur">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-bold transition-colors ${tab === item.id ? 'bg-gradient-to-br from-brand-600 to-violet-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <Icon name={item.icon} className="h-4 w-4" />
            {item.label}
          </button>
        ))}
      </div>

      {busy === 'chat' && tab !== 'ai' && <WorkingCard title="Updating your CV" steps={REFINE_STEPS} hint="usually 10–40 seconds" stepSeconds={5} />}

      {tab === 'preview' && (
        <div className="animate-rise space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white/80 px-3 py-2 shadow-sm">
            <p className="text-xs leading-snug text-slate-600">
              {highlight ? (
                <>
                  <span className="mr-1 inline-block h-3 w-3 rounded-sm bg-emerald-200 align-middle ring-1 ring-emerald-300" />
                  {lastChange ? 'What the AI just changed' : 'Written or reworded by the AI'}
                </>
              ) : (
                'Highlighting is off'
              )}
            </p>
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
              Show changes
              <input type="checkbox" className="peer sr-only" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} />
              <span className="relative h-6 w-11 rounded-full bg-slate-300 transition-colors peer-checked:bg-emerald-500 after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5" />
            </label>
          </div>
          {lastChange && highlight && (
            <button type="button" onClick={() => setLastChange(null)} className="text-xs font-semibold text-brand-700 underline underline-offset-2">
              Show all changes compared with my master CV instead
            </button>
          )}
          <div className="rounded-2xl bg-white/85 p-3 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold tracking-wide text-slate-500 uppercase">Design</p>
              {pages !== null && (
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${pages <= 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                  {pages} page{pages === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="PDF design">
              {DESIGN_OPTIONS.map((d) => {
                const selected = (content.design ?? 'professional') === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    title={d.hint}
                    onClick={() => setContent({ design: d.id as Design })}
                    className={`min-h-11 rounded-xl px-1 text-xs font-bold transition ${selected ? 'bg-gradient-to-br from-brand-600 to-violet-600 text-white shadow' : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200'}`}
                  >
                    {d.name}
                  </button>
                );
              })}
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <Button size="sm" icon="sparkles" onClick={fitToOnePage} loading={fitting} disabled={busy !== null || fitting || pages === 1}>
                {pages === 1 ? 'Fits on 1 page' : 'Fit on one page'}
              </Button>
              <Button size="sm" icon="download" onClick={downloadWord} loading={wordBusy} disabled={wordBusy}>
                Word (.docx)
              </Button>
            </div>
          </div>
          {fitting && <WorkingCard title="Fitting your CV on one page" steps={['Choosing what matters most for this job', 'Tightening the wording', 'Checking the page count']} hint="usually 10–40 seconds" stepSeconds={6} />}
          <CvPreview content={content} changes={shownChanges} />
          <p className="text-center text-xs text-slate-500">The PDF uses exactly this content and order. Green highlighting is never printed.</p>
        </div>
      )}

      {tab === 'ai' && (
        <div className="animate-rise space-y-3">
          <AiChat
            aiConfigured={aiOn}
            messages={draft.chat ?? []}
            value={instruction}
            onChange={setInstruction}
            onSend={() => void sendInstruction()}
            busy={busy === 'chat'}
            disabled={busy !== null}
            inputRef={chatInput}
            onAttachSample={(file) => void restyleFromSample(file)}
          />
          <div className="grid grid-cols-2 gap-2.5">
            <Button icon="refresh" size="sm" onClick={regenerateSummary} loading={busy === 'summary'} disabled={busy !== null}>
              New summary
            </Button>
            <Button icon="plus" size="sm" onClick={() => navigate('/tailor')} disabled={busy !== null}>
              Another job
            </Button>
          </div>
        </div>
      )}

      {tab === 'more' && (
        <div className="animate-rise space-y-3">
          <ApplicationCard
            key={draft.id ?? 'new'}
            versionId={draft.id}
            value={draft.application}
            onSaved={(application) => setDraft({ ...draft, application })}
          />
          <CoverLetterCard draft={draft} aiOn={aiOn} onChange={(coverLetter) => editDraft((d) => ({ ...d, coverLetter }))} />
          <InterviewCard draft={draft} aiOn={aiOn} onChange={(interviewPrep) => editDraft((d) => ({ ...d, interviewPrep }))} />
          <ShareCard versionId={draft.id} share={draft.share} onChange={(share) => setDraft({ ...draft, share })} />
          <LinkedinCard aiOn={aiOn} target={[job.title, job.emphasis].filter(Boolean).join(', ')} />
        </div>
      )}

      {tab === 'match' && (
        <div className="animate-rise">
          <AnalysisPanel
            analysis={draft.analysis}
            generatedBy={draft.generatedBy}
            onBoost={aiOn ? (text) => void sendInstruction(text, 'match') : undefined}
            boosting={busy === 'chat'}
          />
        </div>
      )}

      {tab === 'edit' && (
        <div key={editorKey} className="animate-rise space-y-3">
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
          <Section title="Structure: section order and headings">
            <p className="text-sm leading-relaxed text-slate-600">Applies to this CV only. Set your default structure on the Master CV page.</p>
            <LayoutEditor value={content.layout} onChange={(layout) => setContent({ layout })} />
          </Section>
          <Button variant="primary" icon="eye" className="w-full" onClick={() => goTo('preview')}>
            Preview changes
          </Button>
        </div>
      )}

      <p className="pt-2 text-center text-sm">
        <Link to="/" className="font-medium text-brand-700 underline underline-offset-2">
          Back to dashboard
        </Link>
      </p>

      {/* ---------- always-visible actions, above the bottom navigation ---------- */}
      <div className="fixed inset-x-0 bottom-16 z-20 mb-[env(safe-area-inset-bottom)] border-t border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-2 gap-2.5 px-4 py-2.5">
          <Button icon="save" onClick={saveVersion} loading={busy === 'save'} disabled={busy !== null || (Boolean(draft.id) && !draft.dirty)}>
            {draft.id ? (draft.dirty ? 'Save changes' : 'Saved') : 'Save version'}
          </Button>
          <Button variant="primary" icon="download" onClick={downloadPdf} loading={busy === 'pdf'} disabled={busy !== null}>
            Download PDF
          </Button>
        </div>
      </div>
      <div className="h-16" aria-hidden="true" />
    </div>
  );
}
