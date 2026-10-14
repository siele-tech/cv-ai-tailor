import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useSession } from '../state';
import { Icon, type IconName } from './ui';

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/profile', label: 'Master CV', icon: 'user' },
  { to: '/tailor', label: 'Tailor', icon: 'sparkles' },
  { to: '/history', label: 'Applications', icon: 'clock' },
];

export function Layout() {
  const { status } = useSession();
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 rounded-lg py-1 pr-2 font-bold text-brand-800" aria-label="CV Tailor AI, back to dashboard">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 via-violet-600 to-fuchsia-500 text-xs font-extrabold text-white shadow-md shadow-brand-600/30">CV</span>
            <span className="text-lg font-extrabold tracking-tight text-slate-900">
              CV Tailor <span className="bg-gradient-to-r from-brand-600 to-fuchsia-600 bg-clip-text text-transparent">AI</span>
            </span>
          </Link>
          <div className="flex items-center gap-1">
            {status && !status.aiConfigured && (
              <Link to="/settings" className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
                Demo mode
              </Link>
            )}
            <Link to="/settings" aria-label="Settings" className="flex h-11 w-11 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100">
              <Icon name="settings" className="h-6 w-6" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-5 pb-28">
        <Outlet />
      </main>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-white/60 bg-white/90 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-16px_rgb(67_56_202/0.25)] backdrop-blur-lg">
        <ul className="mx-auto grid max-w-2xl grid-cols-4">
          {NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold ${isActive ? 'text-brand-700' : 'text-slate-500 hover:text-slate-800'}`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={`flex h-7 w-14 items-center justify-center rounded-full transition-colors ${isActive ? 'bg-gradient-to-r from-brand-100 to-fuchsia-100' : ''}`}>
                      <Icon name={item.icon} />
                    </span>
                    {item.label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
