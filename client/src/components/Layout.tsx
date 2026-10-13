import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useSession } from '../state';
import { Icon, type IconName } from './ui';

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/profile', label: 'Master CV', icon: 'user' },
  { to: '/tailor', label: 'Tailor', icon: 'sparkles' },
  { to: '/history', label: 'History', icon: 'clock' },
];

export function Layout() {
  const { status } = useSession();
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 rounded-lg py-1 pr-2 font-bold text-brand-800" aria-label="CV Tailor AI, back to dashboard">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-xs font-bold text-white">CV</span>
            <span className="text-lg tracking-tight">CV Tailor AI</span>
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

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto grid max-w-2xl grid-cols-4">
          {NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium ${isActive ? 'text-brand-700' : 'text-slate-500 hover:text-slate-800'}`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={`flex h-7 w-14 items-center justify-center rounded-full ${isActive ? 'bg-brand-100' : ''}`}>
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
