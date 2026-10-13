import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { Button, Card, Icon, LoadingBlock, Notice, formatDate, type IconName } from '../components/ui';
import { useDraft } from '../state';
import type { Dashboard } from '../types';

function QuickAction({ to, icon, label }: { to: string; icon: IconName; label: string }) {
  return (
    <Link to={to} className="flex min-h-14 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 font-medium text-slate-800 shadow-sm hover:bg-slate-50">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-700">
        <Icon name={icon} />
      </span>
      <span className="flex-1">{label}</span>
      <Icon name="chevron" className="h-4 w-4 text-slate-400" />
    </Link>
  );
}

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
  const unsavedDraft = draft && (!draft.id || draft.dirty);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{firstName ? `Welcome back, ${firstName}` : 'Welcome'}</h1>
        <p className="mt-1 text-[15px] text-slate-600">
          {profile.usable ? 'Paste a job description and get a CV tailored to it.' : 'Start by adding your master CV. It takes a couple of minutes.'}
        </p>
      </div>

      {profile.usable ? (
        <Button variant="primary" size="lg" icon="sparkles" className="w-full" onClick={() => navigate('/tailor')}>
          Create Tailored CV
        </Button>
      ) : (
        <Button variant="primary" size="lg" icon="upload" className="w-full" onClick={() => navigate('/profile')}>
          Add your master CV
        </Button>
      )}

      {unsavedDraft && (
        <Link to={`/cv/${draft.id ?? 'new'}`} className="block">
          <Notice kind="warn" title="You have an unsaved CV">
            {draft.job.title}
            {draft.job.company ? ` at ${draft.job.company}` : ''}. Tap to continue.
          </Notice>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Master CV</p>
          {profile.usable ? (
            <>
              <p className="mt-1.5 flex items-center gap-1.5 font-semibold text-emerald-700">
                <Icon name="check" className="h-4 w-4" /> Ready
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                {profile.counts?.experience ?? 0} roles, {profile.counts?.skills ?? 0} skills
                {profile.updatedAt ? `. Updated ${formatDate(profile.updatedAt)}` : ''}
              </p>
            </>
          ) : (
            <>
              <p className="mt-1.5 flex items-center gap-1.5 font-semibold text-amber-700">
                <Icon name="alert" className="h-4 w-4" /> {profile.exists ? 'Incomplete' : 'Not added'}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">Add experience, skills or education.</p>
            </>
          )}
        </Card>
        <Card>
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">CV versions</p>
          <p className="mt-1 text-3xl leading-tight font-bold text-slate-900 tabular-nums">{data.totalVersions}</p>
          <p className="text-xs text-slate-500">saved so far</p>
        </Card>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Recently tailored</h2>
        {data.recent.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-500">Nothing yet. Your saved CVs will appear here.</p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {data.recent.map((version) => (
              <li key={version.id}>
                <Link to={`/cv/${version.id}`} className="flex min-h-16 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm hover:bg-slate-50">
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
        <h2 className="text-sm font-semibold text-slate-700">Quick actions</h2>
        <QuickAction to="/profile" icon="user" label="Update my master CV" />
        <QuickAction to="/history" icon="clock" label="View previous applications" />
      </section>
    </div>
  );
}
