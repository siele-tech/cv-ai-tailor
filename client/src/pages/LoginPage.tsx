import { useState, type FormEvent } from 'react';
import { errorMessage } from '../api';
import { Button, Field, Notice } from '../components/ui';
import { useSession } from '../state';

export function LoginPage() {
  const { signIn } = useSession();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!password) return setError('Enter your password.');
    setBusy(true);
    setError('');
    try {
      await signIn(password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-700 text-xl font-bold text-white shadow-md">CV</span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">CV Tailor AI</h1>
        <p className="mt-1 text-[15px] text-slate-600">Tailor your CV to any job in minutes.</p>
      </div>
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" noValidate>
        <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
        {error && <Notice kind="error">{error}</Notice>}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <p className="mt-5 text-center text-xs leading-relaxed text-slate-500">
        This is a private, single-user app. Your CV data is only available after signing in.
      </p>
    </main>
  );
}
