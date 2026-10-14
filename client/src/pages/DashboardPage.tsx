import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { Button, Card, Icon, LoadingBlock, Notice, formatDate, type IconName } from '../components/ui';
import { useDraft } from '../state';
import type { Dashboard } from '../types';

function QuickAction({ to, icon, label, hint, tint }: { to: string; icon: IconName; label: string; hint: string; tint: string }) {
  return (
    <Link to={to} className="flex min-h-16 items-center gap-3 rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tint}`}>
        <Icon name={icon} />
      </span>
      <span className="flex-1">
        <span className="block font-semibold text-slate-900">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
      <Icon name="chevron" className="h-4 w-4 text-slate-400" />
    </Link>
  );
}

const scoreTone = (score: number) => (score >= 70 ? 'bg-emerald-100 text-emerald-700' : score >= 45 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-700');

export function DashboardPage() {
  const navigate = useNavigate();
  const { draft } = useDraft();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError('');
    api
      .dashboard()
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (error) {
    return (
      <div className="space-y-3">
        <Notice kind="error" title="Could not load your dashboard">
          {error}
        </Notice>
        <Button icon="refresh" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </Button>
      </div>
    );
  }
  if (!data) return <LoadingBlock />;

  const { profile } = data;
  const firstName = profile.fullName?.trim().split(/\s+/)[0];
  const name = firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase() : '';
  const unsavedDraft = draft && (!draft.id || draft.dirty);

  return (
    <div className="space-y-4">
      {/* ---------- hero ---------- */}
      <section className="animate-rise relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-violet-600 to-fuchsia-600 p-5 text-white shadow-xl shadow-brand-600/25">
        <div className="pointer-events-none absolute -top-16 -right-12 h-48 w-48 rounded-full bg-white/15 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-44 w-44 rounded-full bg-fuchsia-300/30 blur-2xl" />
        <div className="relative">
          <p className="text-sm font-medium text-white/80">{name ? `Hi ${name}` : 'Welcome'}</p>
          <h1 className="mt-1 text-2xl leading-tight font-extrabold">
            {profile.usable ? 'Ready for your next application?' : 'Let’s set up your master CV'}
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-white/85">
            {profile.usable ? 'Paste any job advert and get a CV written for it in under a minute.' : 'Upload your CV once. Every tailored CV is built from it.'}
          </p>
          <button
            type="button"
            onClick={() => navigate(profile.usable ? '/tailor' : '/profile')}
            className="mt-4 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-base font-bold text-brand-700 shadow-lg transition active:scale-[0.98]"
          >
            <Icon name={profile.usable ? 'sparkles' : 'upload'} />
            {profile.usable ? 'Create Tailored CV' : 'Add my master CV'}
          </button>
        </div>
      </section>

      {unsavedDraft && (
        <Link to={`/cv/${draft.id ?? 'new'}`} className="block">
          <Notice kind="warn" title="You have an unsaved CV">
            {draft.job.title}
            {draft.job.company ? ` at ${draft.job.company}` : ''}. Tap to continue.
          </Notice>
        </Link>
      )}

      {/* ---------- status ---------- */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${profile.usable ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            <Icon name={profile.usable ? 'check' : 'alert'} />
          </span>
          <p className="mt-2 text-xs font-medium text-slate-500">Master CV</p>
          <p className="font-bold text-slate-900">{profile.usable ? 'Ready' : profile.exists ? 'Incomplete' : 'Not added'}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {profile.usable ? `${profile.counts?.experience ?? 0} roles · ${profile.counts?.skills ?? 0} skills` : 'Add experience or skills'}
          </p>
        </Card>
        <Card>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <Icon name="clock" />
          </span>
          <p className="mt-2 text-xs font-medium text-slate-500">CVs saved</p>
          <p className="text-2xl leading-tight font-extrabold text-slate-900 tabular-nums">{data.totalVersions}</p>
        </Card>
      </div>

      {/* ---------- recent ---------- */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">Recently tailored</h2>
          {data.recent.length > 0 && (
            <Link to="/history" className="text-xs font-semibold text-brand-700">
              See all
            </Link>
          )}
        </div>
        {data.recent.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-500">Nothing yet. Your saved CVs will appear here.</p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {data.recent.map((version) => (
              <li key={version.id}>
                <Link to={`/cv/${version.id}`} className="flex min-h-16 items-center gap-3 rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  {typeof version.score === 'number' ? (
                    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold ${scoreTone(version.score)}`}>{version.score}%</span>
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                      <Icon name="edit" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{version.jobTitle}</p>
                    <p className="truncate text-sm text-slate-500">{[version.company, formatDate(version.createdAt)].filter(Boolean).join(' · ')}</p>
                  </div>
                  <Icon name="chevron" className="h-4 w-4 text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-slate-800">Quick actions</h2>
        <QuickAction to="/profile" icon="user" label="Update my master CV" hint="Your full, true record" tint="bg-violet-100 text-violet-700" />
        <QuickAction to="/history" icon="clock" label="Previous applications" hint="Open, edit or download" tint="bg-fuchsia-100 text-fuchsia-700" />
      </section>
    </div>
  );
}
