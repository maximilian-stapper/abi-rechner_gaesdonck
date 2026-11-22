// untis-worker.js – winziger Proxy für untis.js (Cloudflare Worker, nur für den Live-Abruf)
//
// Warum nötig? WebUntis erlaubt keine Browser-Aufrufe von fremden Seiten (CORS), und der
// Browser darf den Cookie-Header nicht selbst setzen. Der Worker leitet nur weiter und
// reicht die Untis-Cookies als Header X-Untis-Cookie hin und zurück.
//
// Einrichten: Cloudflare → Workers → neuen Worker anlegen → diesen Code einfügen → deployen.
// Dann in der App (Untis → Einrichten) die Worker-Adresse eintragen und in index.html im CSP
// connect-src von 'none' auf die Worker-Adresse ändern:  connect-src https://DEIN-WORKER.workers.dev
// Der Worker selbst läuft bei Cloudflare, nicht auf GitHub Pages. GitHub Pages liefert nur die Seite aus;
// der Browser ruft von dort aus den Worker auf. Deshalb muss die Adresse der Seite (nur Origin, ohne Pfad)
// unten in OK_ORIGINS stehen. Mit „Proxy prüfen“ in der App lässt sich das testen (Route /ping).
//
// DATENSCHUTZ: Benutzername und Passwort laufen beim Anmelden durch diesen Worker. Nutze
// nur einen eigenen Worker, logge keine Request-Bodies und teile die URL nicht.

const OK_ORIGINS = [
  'https://maximilian-stapper.github.io', // deine GitHub-Pages-Adresse
  // 'http://localhost:8000',             // nur zum lokalen Testen
];

export default {
  async fetch(req) {
    const origin = req.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': OK_ORIGINS.includes(origin) ? origin : OK_ORIGINS[0],
      'Access-Control-Allow-Headers': 'Content-Type, X-Untis-Cookie',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Expose-Headers': 'X-Untis-Cookie',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!OK_ORIGINS.includes(origin)) return new Response('forbidden', { status: 403, headers: cors });

    // Aufbau: https://worker/<server>.webuntis.com/WebUntis/...
    const u = new URL(req.url);
    if (u.pathname === '/ping') return new Response('ok', { headers: { ...cors, 'Content-Type': 'text/plain' } }); // Erreichbarkeits- und Origin-Test
    const [, host, ...rest] = u.pathname.split('/');
    if (!/^[a-z0-9-]+\.webuntis\.com$/i.test(host || '')) return new Response('bad host', { status: 400, headers: cors });

    const h = new Headers({ 'Content-Type': req.headers.get('Content-Type') || 'application/json' });
    const ck = req.headers.get('X-Untis-Cookie');
    if (ck) h.set('Cookie', ck);

    let r;
    try {
      r = await fetch('https://' + host + '/' + rest.join('/') + u.search, {
        method: req.method,
        headers: h,
        body: req.method === 'POST' ? await req.text() : undefined,
        redirect: 'manual',
      });
    } catch (e) {
      // Ohne diese Antwort sähe der Browser nur einen CORS-Fehler statt einer verständlichen Meldung
      return new Response('upstream error', { status: 502, headers: cors });
    }

    const out = new Headers(cors);
    out.set('Content-Type', r.headers.get('Content-Type') || 'application/json');
    const jar = (r.headers.getSetCookie ? r.headers.getSetCookie() : []).map((c) => c.split(';')[0]).join('; ');
    if (jar) out.set('X-Untis-Cookie', jar);
    return new Response(r.body, { status: r.status, headers: out });
  },
};
