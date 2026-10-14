// "Your CV is ready" notifications for when the user has switched to another app while the
// AI works. Permission is asked for only when the user starts an AI task (a tap), and only once.

export function askToNotify() {
  try {
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
  } catch {
    // not supported
  }
}

export function notifyIfHidden(title: string, body = '') {
  try {
    navigator.vibrate?.([80, 60, 80]);
  } catch {
    // vibration is optional
  }
  if (!document.hidden) return;
  const original = document.title;
  document.title = `${title} - CV Tailor AI`;
  const restore = () => {
    if (document.hidden) return;
    document.title = original;
    document.removeEventListener('visibilitychange', restore);
  };
  document.addEventListener('visibilitychange', restore);

  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    // Android Chrome only shows notifications through the service worker.
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      void navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, { body, icon: '/icon-192.png', tag: 'cv-ready' }));
    } else {
      new Notification(title, { body, icon: '/icon-192.png', tag: 'cv-ready' });
    }
  } catch {
    // notifications are a nicety; never fail the task because of them
  }
}
