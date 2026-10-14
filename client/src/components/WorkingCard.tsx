import { useEffect, useState } from 'react';
import { onAiRetry } from '../api';
import { Icon, Spinner } from './ui';

/**
 * Shown while the AI works. The server reports no progress, so the steps advance on a
 * timer as a guide to what is happening, and the last one keeps spinning until it finishes.
 */
export function WorkingCard({ title, steps, hint, stepSeconds = 6 }: { title: string; steps: string[]; hint?: string; stepSeconds?: number }) {
  const [active, setActive] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  // Seconds until an automatic retry, while the AI provider is busy.
  const [retryIn, setRetryIn] = useState<number | null>(null);
  useEffect(() => onAiRetry(setRetryIn), []);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      const seconds = (Date.now() - started) / 1000;
      setElapsed(Math.floor(seconds));
      setActive(Math.min(steps.length - 1, Math.floor(seconds / stepSeconds)));
    }, 500);
    return () => clearInterval(timer);
  }, [steps.length, stepSeconds]);

  return (
    <div role="status" aria-live="polite" className="animate-rise overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-violet-600 to-fuchsia-600 p-[1.5px] shadow-lg shadow-brand-600/20">
      <div className="rounded-[15px] bg-white p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-fuchsia-500 text-white">
            <Icon name="sparkles" className="h-6 w-6 animate-pulse" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-slate-900">{title}</p>
            {retryIn !== null ? (
              <p className="text-xs font-semibold text-amber-700 tabular-nums">The AI is busy. Trying again in {retryIn}s…</p>
            ) : (
              <p className="text-xs text-slate-500 tabular-nums">{elapsed}s{hint ? ` · ${hint}` : ''}</p>
            )}
          </div>
        </div>
        <ol className="mt-4 space-y-2.5">
          {steps.map((step, i) => (
            <li key={step} className={`flex items-center gap-2.5 text-sm transition-colors ${i < active ? 'text-slate-500' : i === active ? 'font-semibold text-slate-900' : 'text-slate-400'}`}>
              {i < active ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <Icon name="check" className="h-3.5 w-3.5" />
                </span>
              ) : i === active ? (
                <Spinner className="h-5 w-5 text-brand-600" />
              ) : (
                <span className="h-5 w-5 rounded-full border-2 border-slate-200" />
              )}
              {step}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
