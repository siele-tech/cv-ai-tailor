import { useEffect, useState } from 'react';

const tone = (score: number) =>
  score >= 70
    ? { from: '#10b981', to: '#059669', text: 'text-emerald-700', label: 'Strong match' }
    : score >= 45
      ? { from: '#f59e0b', to: '#d97706', text: 'text-amber-700', label: 'Fair match' }
      : { from: '#fb7185', to: '#e11d48', text: 'text-rose-700', label: 'Weak match' };

/** Circular gauge for the estimated match score; animates when it appears or changes. */
export function ScoreRing({ score, size = 112, label = true }: { score: number; size?: number; label?: boolean }) {
  const value = Math.max(0, Math.min(100, Math.round(score)));
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(id);
  }, [value]);

  const stroke = Math.max(8, size / 11);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const t = tone(value);
  const gradientId = `score-${size}-${value}`;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Estimated match ${value} out of 100, ${t.label.toLowerCase()}`}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={t.from} />
            <stop offset="100%" stopColor={t.to} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown / 100)}
          style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(0.2, 0.8, 0.2, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-extrabold tabular-nums leading-none ${t.text}`} style={{ fontSize: size / 3.4 }}>
          {value}
          <span className="text-[0.45em] font-bold">%</span>
        </span>
        {label && size >= 96 && <span className="mt-1 text-[11px] font-semibold text-slate-500">{t.label}</span>}
      </div>
    </div>
  );
}
