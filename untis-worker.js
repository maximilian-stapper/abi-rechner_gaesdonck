// untis-worker.js – kleiner Proxy für den Untis-Planer (Cloudflare Worker)
//
// Läuft unter https://untis-worker.maximilian-stapper.workers.dev und spricht NUR mit gaesdonck.webuntis.com.
//
// Warum nötig? WebUntis erlaubt keine Browser-Aufrufe von fremden Seiten (CORS), und der Browser darf den
// Cookie-Header nicht selbst setzen. Der Worker leitet weiter und reicht die Untis-Cookies als Header
// X-Untis-Cookie hin und zurück.
//
// ROUTEN
//   GET  /ping                                  Erreichbarkeits- und Origin-Test
//   POST /login   {"email","password"}          Anmeldung mit dem Microsoft-Konto der Schule (wie der Knopf
//                                               „Office 365“ auf der Untis-Seite). Antwort {ok:true} und die
//                                               Untis-Sitzung als Header X-Untis-Cookie, sonst {ok:false, code, message}.
//   *    /gaesdonck.webuntis.com/WebUntis/...   Weiterleitung an Untis (mit Cookie- und Authorization-Header)
//
// Einrichten: Cloudflare → Workers → Worker „untis-worker“ → Code bearbeiten → diesen Code einfügen → Deploy.
// Die Adresse der Seite (nur Origin, ohne Pfad) muss unten in OK_ORIGINS stehen.
//
// DATENSCHUTZ: E-Mail und Microsoft-Passwort laufen beim Anmelden durch diesen Worker und werden nur an
// login.microsoftonline.com weitergegeben. Der Worker speichert und loggt nichts. Logge keine Request-Bodies.

const OK_ORIGINS = [
  'https://maximilian-stapper.github.io', // GitHub-Pages-Adresse
  // 'http://localhost:8000',             // nur zum lokalen Testen
];
const UNTIS = 'gaesdonck.webuntis.com';
const SCHOOL = 'gaesdonck';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
// Während der Microsoft-Anmeldung dürfen nur diese Hosts aufgerufen werden
const LOGIN_HOSTS = /^(login\.microsoftonline\.com|login\.microsoft\.com|login\.live\.com|o365\.webuntis\.com|gaesdonck\.webuntis\.com)$/i;

export default {
  async fetch(req) {
    const origin = req.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': OK_ORIGINS.includes(origin) ? origin : OK_ORIGINS[0],
      'Access-Control-Allow-Headers': 'Content-Type, X-Untis-Cookie, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Expose-Headers': 'X-Untis-Cookie',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!OK_ORIGINS.includes(origin)) return new Response('forbidden', { status: 403, headers: cors });

    const u = new URL(req.url);
    if (u.pathname === '/ping') return new Response('ok', { headers: { ...cors, 'Content-Type': 'text/plain' } });
    if (u.pathname === '/login') return login(req, cors);

    // Aufbau: https://worker/gaesdonck.webuntis.com/WebUntis/...
    const [, host, ...rest] = u.pathname.split('/');
    if (String(host).toLowerCase() !== UNTIS || rest[0] !== 'WebUntis' || rest.includes('..')) return new Response('bad host', { status: 400, headers: cors });

    const h = new Headers({ 'Content-Type': req.headers.get('Content-Type') || 'application/json', 'User-Agent': UA });
    const ck = req.headers.get('X-Untis-Cookie');
    if (ck) h.set('Cookie', ck);
    const au = req.headers.get('Authorization');
    if (au) h.set('Authorization', au);

    let r;
    try {
      r = await fetch('https://' + UNTIS + '/' + rest.join('/') + u.search, {
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
    const jar = setCookies(r.headers).map((c) => c.split(';')[0]).join('; ');
    if (jar) out.set('X-Untis-Cookie', jar);
    return new Response(r.body, { status: r.status, headers: out });
  },
};

const setCookies = (h) => (h.getSetCookie ? h.getSetCookie() : []);

// ---------- Microsoft-Anmeldung ----------
async function login(req, cors) {
  const reply = (status, o, cookie) => {
    const h = new Headers({ ...cors, 'Content-Type': 'application/json' });
    if (cookie) h.set('X-Untis-Cookie', cookie);
    return new Response(JSON.stringify(o), { status, headers: h });
  };
  if (req.method !== 'POST') return reply(405, { ok: false, code: 'METHOD', message: 'Nur POST.' });
  let b;
  try {
    b = await req.json();
  } catch (e) {
    return reply(400, { ok: false, code: 'INPUT', message: 'Ungültige Anfrage.' });
  }
  const email = String((b && b.email) || '').trim(), pass = String((b && b.password) || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return reply(400, { ok: false, code: 'INPUT', message: 'Bitte deine Schul-E-Mail-Adresse eintragen.' });
  if (!pass || pass.length > 256) return reply(400, { ok: false, code: 'INPUT', message: 'Bitte dein Microsoft-Passwort eintragen.' });
  try {
    const cookie = await msLogin(email, pass);
    return reply(200, { ok: true }, cookie);
  } catch (e) {
    if (e && e.code) return reply(e.code === 'AUTH' ? 401 : 502, { ok: false, code: e.code, message: e.message });
    return reply(502, { ok: false, code: 'NET', message: 'Microsoft oder Untis ist gerade nicht erreichbar.' });
  }
}

const fail = (code, message) => Object.assign(new Error(message), { code });

// Kleiner Cookie-Speicher über mehrere Hosts (Pfade werden ignoriert, das reicht hier)
class Jar {
  constructor() {
    this.c = [];
  }
  take(host, headers) {
    for (const s of setCookies(headers)) {
      const [nv, ...attrs] = s.split(';');
      const i = nv.indexOf('=');
      if (i < 1) continue;
      const n = nv.slice(0, i).trim(), v = nv.slice(i + 1).trim();
      let d = host, hostOnly = true, gone = false;
      for (const a of attrs) {
        const [k, ...x] = a.trim().split('='), val = x.join('=').trim(), key = k.toLowerCase();
        if (key === 'domain' && val) (d = val.replace(/^\./, '').toLowerCase()), (hostOnly = false);
        else if (key === 'max-age' && +val <= 0) gone = true;
        else if (key === 'expires' && Date.parse(val) < Date.now()) gone = true;
      }
      this.c = this.c.filter((x) => !(x.n === n && x.d === d));
      if (!gone) this.c.push({ n, v, d, hostOnly });
    }
  }
  header(host) {
    host = host.toLowerCase();
    return this.c.filter((x) => (x.hostOnly ? host === x.d : host === x.d || host.endsWith('.' + x.d))).map((x) => x.n + '=' + x.v).join('; ');
  }
}

async function step(jar, url, form) {
  const u = new URL(url);
  if (u.protocol !== 'https:') throw fail('FLOW', 'Unerwartete Weiterleitung während der Anmeldung.');
  if (!LOGIN_HOSTS.test(u.hostname))
    throw fail('FEDERATED', 'Die Anmeldung führt auf eine fremde Seite (' + u.hostname + '). Das unterstützt der Worker nicht. Nutze unter „Andere Wege“ den Kalender-Link.');
  const h = new Headers({ 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8', 'Accept-Language': 'de-DE,de;q=0.9' });
  const ck = jar.header(u.hostname);
  if (ck) h.set('Cookie', ck);
  let body;
  if (form) {
    h.set('Content-Type', 'application/x-www-form-urlencoded');
    body = new URLSearchParams(form).toString();
  }
  const r = await fetch(u.href, { method: form ? 'POST' : 'GET', headers: h, body, redirect: 'manual' });
  jar.take(u.hostname, r.headers);
  const loc = r.status >= 300 && r.status < 400 && r.headers.get('Location');
  return { r, url: u.href, host: u.hostname.toLowerCase(), loc: loc ? new URL(loc, u).href : null };
}

// $Config={...}; aus einer Microsoft-Seite lesen (Klammern zählen, Strings beachten)
function msConfig(html) {
  const i = html.indexOf('$Config=');
  if (i < 0) return null;
  const s = html.indexOf('{', i);
  let depth = 0, str = false, esc = false;
  for (let j = s; j < html.length; j++) {
    const ch = html[j];
    if (str) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') str = false;
    } else if (ch === '"') str = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      try {
        return JSON.parse(html.slice(s, j + 1));
      } catch (e) {
        return null;
      }
    }
  }
  return null;
}

// Selbst abschickendes Formular (form_post) lesen: action + versteckte Felder
function autoForm(html, base) {
  const f = /<form\b[^>]*\baction="([^"]+)"[^>]*>([\s\S]*?)<\/form>/i.exec(html);
  if (!f) return null;
  const dec = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x2f;/gi, '/');
  const fields = {};
  for (const m of f[2].matchAll(/<input\b[^>]*>/gi)) {
    const n = /\bname="([^"]*)"/i.exec(m[0]), v = /\bvalue="([^"]*)"/i.exec(m[0]);
    if (n) fields[dec(n[1])] = v ? dec(v[1]) : '';
  }
  if (!Object.keys(fields).length) return null;
  return { action: new URL(dec(f[1]), base).href, fields };
}

const MS_ERR = {
  50126: ['AUTH', 'E-Mail oder Passwort ist falsch.'],
  50034: ['AUTH', 'Zu dieser E-Mail-Adresse gibt es kein Microsoft-Konto.'],
  50059: ['AUTH', 'Zu dieser E-Mail-Adresse gibt es kein Microsoft-Konto.'],
  50053: ['LOCKED', 'Das Microsoft-Konto ist vorübergehend gesperrt (zu viele Versuche). Später erneut probieren.'],
  50057: ['LOCKED', 'Das Microsoft-Konto ist deaktiviert.'],
  50055: ['PWCHANGE', 'Das Microsoft-Passwort ist abgelaufen. Ändere es zuerst auf office.com.'],
  50144: ['PWCHANGE', 'Das Microsoft-Passwort ist abgelaufen. Ändere es zuerst auf office.com.'],
  50076: ['MFA', 'Dein Konto verlangt eine zweite Bestätigung (MFA). Das kann der Worker nicht. Nutze unter „Andere Wege“ den Kalender-Link.'],
  50079: ['MFA', 'Dein Konto verlangt eine zweite Bestätigung (MFA). Das kann der Worker nicht. Nutze unter „Andere Wege“ den Kalender-Link.'],
};
const mfa = () => fail('MFA', MS_ERR[50076][1]);

async function msLogin(email, pass) {
  const jar = new Jar(), base = 'https://' + UNTIS + '/WebUntis/';
  await step(jar, base + '?school=' + SCHOOL); // Schul-Cookies (schoolname, Tenant-Id)
  let x = await step(jar, base + 'oauth2/authorization/office365?school=' + SCHOOL);
  let sent = false, kmsi = 0, reload = 0, lastForm = null;
  for (let i = 0; i < 20; i++) {
    if (x.loc) {
      x = await step(jar, x.loc);
      continue;
    }
    const html = await x.r.text();
    if (x.host.endsWith('webuntis.com')) {
      // Zurück bei Untis: Fehlermeldung der Untis-Seite übernehmen, falls vorhanden
      const m = /"loginError"\s*:\s*"([^"]+)"/.exec(html);
      if (m) throw fail('UNTIS', 'Untis meldet: ' + m[1]);
      if (x.host === UNTIS) break;
    }
    const c = msConfig(html);
    if (!c) {
      const f = autoForm(html, x.url);
      if (f) {
        x = await step(jar, f.action, f.fields);
        continue;
      }
      throw fail('FLOW', 'Unerwartete Antwort während der Anmeldung (Status ' + x.r.status + ').');
    }
    // Zwischenseite, die sich selbst neu lädt (sso_reload): einfach die angegebene Adresse aufrufen
    if (!c.sFT && c.urlPost && /\/oauth2\/(v2\.0\/)?authorize/i.test(c.urlPost) && ++reload <= 3) {
      x = await step(jar, new URL(c.urlPost, x.url).href);
      continue;
    }
    // „Umleitung“ nach jedem Absenden (50168): Die Seite schickt DASSELBE Formular per Skript erneut an urlPost (sso_reload=True)
    if (sent && !c.pgid && lastForm && c.urlPost && /sso_reload/i.test(c.urlPost) && ++reload <= 8) {
      x = await step(jar, new URL(c.urlPost, x.url).href, Object.assign({}, lastForm, c.sFT ? { flowToken: c.sFT } : {}, c.sCtx ? { ctx: c.sCtx } : {}, c.canary ? { canary: c.canary } : {}));
      continue;
    }
    // Fehlercodes zählen erst nach dem Absenden (vorher meldet Microsoft z. B. 50058 = „noch nicht angemeldet“)
    // Keine echten Fehler: 50058 nicht angemeldet, 50140 „Angemeldet bleiben?“, 50168 Umleitung
    const raw = sent ? +(c.sErrorCode || c.iErrorCode || c.stsErrorCode || 0) : 0,
      code = [50058, 50140, 50168].includes(raw) ? 0 : raw;
    if (code && MS_ERR[code]) throw fail(...MS_ERR[code]);
    if (code) throw fail('MS', 'Microsoft lehnt die Anmeldung ab (Fehler ' + code + ').');
    if (c.strServiceExceptionMessage) throw fail('MS', 'Microsoft meldet: ' + String(c.strServiceExceptionMessage).slice(0, 200));
    const pg = String(c.pgid || '');
    const post = (form) => step(jar, new URL(c.urlPost || '/common/login', x.url).href, (lastForm = form));
    if (/TFA|ProofUp|Mfa/i.test(pg) || (c.arrUserProofs && c.arrUserProofs.length)) throw mfa();
    if (/ChangePassword/i.test(pg)) throw fail(...MS_ERR[50055]);
    if (/Kmsi/i.test(pg)) {
      if (++kmsi > 2) break;
      x = await post({ LoginOptions: '1', type: '28', ctx: c.sCtx, hpgrequestid: c.sessionId || '', flowToken: c.sFT, canary: c.canary || '', i19: '2000' });
      continue;
    }
    if (/ConvergedSignIn/i.test(pg) || (!sent && c.sFT && c.sCtx)) {
      if (sent && kmsi) throw fail('FLOW', 'Microsoft hat nach „Angemeldet bleiben?“ wieder die Anmeldeseite gezeigt.');
      if (sent) throw fail('AUTH', 'E-Mail oder Passwort ist falsch.');
      sent = true;
      x = await post({
        i13: '0', login: email, loginfmt: email, type: '11', LoginOptions: '3', lrt: '', lrtPartition: '', hisRegion: '', hisScaleUnit: '',
        passwd: pass, ps: '2', psRNGCDefaultType: '', psRNGCEntropy: '', psRNGCSLK: '', canary: c.canary || '', ctx: c.sCtx,
        hpgrequestid: c.sessionId || '', flowToken: c.sFT, PPSX: '', NewUser: '1', FoundMSAs: '', fspost: '0', i21: '0',
        CookieDisclosure: '0', IsFidoSupported: '1', isSignupPost: '0', DfpArtifact: '', i19: '3000',
      });
      continue;
    }
    throw fail('FLOW', 'Microsoft zeigt eine Seite, die der Worker nicht kennt (' + (pg || 'unbekannt') + '). Melde dich einmal im Browser bei Untis an und bestätige dort alles.');
  }
  // Prüfen, ob Untis die Anmeldung übernommen hat
  const t = await step(jar, base + 'api/token/new');
  const tok = t.loc ? '' : (await t.r.text()).trim();
  if (!t.r.ok || !/^[\w-]+\.[\w-]+\.[\w-]*$/.test(tok)) throw fail('FLOW', 'Untis hat die Microsoft-Anmeldung nicht übernommen. Melde dich einmal im Browser bei Untis mit Microsoft an und probiere es dann erneut.');
  return jar.header(UNTIS);
}
