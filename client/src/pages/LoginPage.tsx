import { useState, type FormEvent } from 'react';
import { errorMessage } from '../api';
import { Button, Field, Notice } from '../components/ui';
import { useSession } from '../state';

type Mode = 'signin' | 'join';

export function LoginPage() {
  const { signIn, join } = useSession();
  // An invite link (…/?invite=CODE) opens straight on the join form with the code filled in.
  const inviteFromLink = new URLSearchParams(window.location.search).get('invite') ?? '';
  const [mode, setMode] = useState<Mode>(inviteFromLink ? 'join' : 'signin');
  const [ownerMode, setOwnerMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState(inviteFromLink);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (mode === 'signin') {
      if (!ownerMode && !email.trim()) return setError('Enter your email address.');
      if (!password) return setError('Enter your password.');
    } else {
      if (!code.trim() || !name.trim() || !email.trim()) return setError('Fill in every field.');
      if (password.length < 8) return setError('Choose a password of at least 8 characters.');
    }
    setBusy(true);
    try {
      if (mode === 'signin') await signIn(ownerMode ? '' : email.trim(), password);
      else await join({ code: code.trim(), name: name.trim(), email: email.trim(), password });
      if (inviteFromLink) window.history.replaceState(null, '', '/');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <div className="animate-rise mb-7 text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 via-violet-600 to-fuchsia-500 text-xl font-extrabold text-white shadow-lg shadow-brand-600/30">CV</span>
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-slate-900">
          CV Tailor <span className="bg-gradient-to-r from-brand-600 to-fuchsia-600 bg-clip-text text-transparent">AI</span>
        </h1>
        <p className="mt-1 text-[15px] text-slate-600">A CV written for every job you apply to.</p>
      </div>

      <div role="tablist" aria-label="Sign in or join" className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-white/80 p-1 shadow-sm">
        {(['signin', 'join'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => switchMode(m)}
            className={`min-h-11 rounded-xl text-sm font-bold transition ${mode === m ? 'bg-gradient-to-r from-brand-600 to-violet-600 text-white shadow' : 'text-slate-600'}`}
          >
            {m === 'signin' ? 'Sign in' : 'Join with invite'}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-3xl border border-white/70 bg-white/90 p-5 shadow-xl shadow-brand-600/10 backdrop-blur" noValidate>
        {mode === 'join' && (
          <>
            <Field label="Invite code" value={code} onChange={(v) => setCode(v.toUpperCase())} placeholder="CVT-XXXX-XXXX" autoComplete="off" maxLength={40} />
            <Field label="Your name" value={name} onChange={setName} autoComplete="name" maxLength={120} />
          </>
        )}
        {(mode === 'join' || !ownerMode) && <Field label="Email" type="email" inputMode="email" value={email} onChange={setEmail} autoComplete="email" maxLength={160} />}
        <Field
          label={mode === 'join' ? 'Choose a password' : ownerMode ? 'Owner password' : 'Password'}
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete={mode === 'join' ? 'new-password' : 'current-password'}
          hint={mode === 'join' ? 'At least 8 characters.' : undefined}
        />
        {error && <Notice kind="error">{error}</Notice>}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
          {busy ? 'Please wait…' : mode === 'join' ? 'Create my account' : 'Sign in'}
        </Button>
        {mode === 'signin' && (
          <button type="button" onClick={() => setOwnerMode(!ownerMode)} className="w-full text-center text-xs font-semibold text-brand-700">
            {ownerMode ? 'Sign in with email instead' : 'I am the app owner'}
          </button>
        )}
      </form>
      <p className="mt-5 text-center text-xs leading-relaxed text-slate-500">
        {mode === 'join' ? 'You need an invite code from the person who runs this app.' : 'Each person’s CVs are private to them.'}
      </p>
    </main>
  );
}
