import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import './index.css';
import { CvPage } from './pages/CvPage';
import { DashboardPage } from './pages/DashboardPage';
import { HistoryPage } from './pages/HistoryPage';
import { LoginPage } from './pages/LoginPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { SharedPage } from './pages/SharedPage';
import { TailorPage } from './pages/TailorPage';
import { AppProviders, useSession } from './state';

function App() {
  const { signedIn } = useSession();
  // Shared CV links work for anyone, signed in or not.
  const shared = /^\/s\/([A-Za-z0-9_-]{20,40})$/.exec(window.location.pathname);
  if (shared?.[1]) return <SharedPage token={shared[1]} />;
  if (!signedIn) return <LoginPage />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="tailor" element={<TailorPage />} />
        <Route path="cv/:id" element={<CvPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppProviders>
        <App />
      </AppProviders>
    </BrowserRouter>
  </StrictMode>,
);

// Installable PWA. Only in production builds, so the dev server is never shadowed by a cache.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
