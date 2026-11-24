// sw.js – Service Worker nur für die Hausaufgaben-Erinnerungen (Web Push, siehe untis-push.js).
// Er zeigt die Mitteilungen an und öffnet beim Antippen den Untis-Tab. Absichtlich OHNE fetch-Handler und
// ohne Cache: Die Seite lädt weiter ganz normal, die Update-Prüfung (version.json) bleibt unberührt.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch (x) {
    d = { body: e.data ? e.data.text() : '' };
  }
  // Safari beendet das Abo, wenn ein Push keine Mitteilung zeigt: deshalb immer eine anzeigen
  e.waitUntil(
    self.registration.showNotification(d.title || 'Hausaufgaben', {
      body: d.body || '',
      tag: d.tag || 'hausaufgaben', // neue Erinnerung ersetzt die alte
      icon: 'apple-touch-icon.png',
      data: { url: d.url || '#un' },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '#un', self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      const c = cs.find((x) => x.url.startsWith(self.registration.scope));
      if (c) {
        c.postMessage({ open: 'un' });
        return c.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
