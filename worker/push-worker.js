// push-worker.js – Hausaufgaben-Erinnerungen per Web Push (Cloudflare Worker „push-worker“)
//
// Läuft unter https://push-worker.maximilian-stapper.workers.dev, getrennt vom Untis-Worker.
// Die App schickt ihm ihre offenen Hausaufgaben (Fach, Fälligkeit, Text) und die Push-Adresse des Geräts.
// Einmal pro Stunde (Cron) sucht er alle Geräte, die zu dieser Uhrzeit erinnert werden wollen, und schickt
// ihnen eine Mitteilung mit den Hausaufgaben, die in den nächsten Tagen fällig sind. Er meldet sich nie
// selbst bei Untis an: neue Hausaufgaben kennt er erst, wenn die App sie beim Abgleich geschickt hat.
//
// ROUTEN (nur von OK_ORIGINS)
//   GET  /ping                         {ok, kv}: erreichbar? KV-Speicher verbunden?
//   GET  /key                          {key}: öffentlicher VAPID-Schlüssel (wird beim ersten Aufruf erzeugt)
//   POST /save   {id, sub, days, hour, hw}   Gerät anmelden bzw. Einstellungen und Hausaufgaben ersetzen
//   POST /delete {id}                  Gerät abmelden, alles löschen
//   POST /test   {id}                  sofort eine Mitteilung mit dem heutigen Stand schicken
//   id = Zufallswert der App (wie ein Passwort für diesen Eintrag), sub = PushSubscription.toJSON(),
//   days = 1–7 (ab wie vielen Tagen vor der Abgabe erinnern), hour = 0–23 (Uhrzeit in Deutschland),
//   hw = [{d:'2026-11-25', s:'Mathe', t:'S. 34 Nr. 5'}] (nur offene)
//
// EINRICHTEN (Cloudflare-Dashboard, einmalig)
//   1. Workers & Pages → Erstellen → Worker „push-worker“ → diesen Code einfügen → Deploy.
//   2. Speicher & Datenbanken → KV → Namespace anlegen (Name egal, z. B. „push-storage“).
//   3. Worker → Einstellungen → Bindungen → KV-Namespace hinzufügen: Variablenname PUSH, Namespace von oben.
//   4. Worker → Einstellungen → Trigger-Ereignisse → Cron-Trigger: 0 * * * *   (jede volle Stunde)
//   Die VAPID-Schlüssel erzeugt der Worker selbst und legt sie im KV unter „vapid“ ab. Diesen Eintrag nie
//   löschen, sonst müssen alle Geräte die Erinnerungen neu einschalten (die App merkt das und tut es selbst).
//
// DATENSCHUTZ: Gespeichert werden nur die Push-Adresse des Geräts, die Einstellungen und Fach, Fälligkeit
// und Text der offenen Hausaufgaben. Einträge verfallen nach 60 Tagen ohne Kontakt; „Ausschalten“ in der
// App löscht sofort. Keine Namen, keine Zugangsdaten. Logge keine Request-Bodies.

const OK_ORIGINS = [
  'https://maximilian-stapper.github.io', // GitHub-Pages-Adresse
  // 'http://localhost:8765',             // nur zum lokalen Testen
];
const SUBJECT = 'https://maximilian-stapper.github.io'; // Absender für die Push-Dienste (VAPID „sub“)
const KEEP = 60 * 86400; // Einträge ohne Kontakt verfallen nach 60 Tagen
const TTL = 6 * 3600; // Mitteilung bis zu 6 Stunden zustellen, falls das Gerät offline ist
// Nur an echte Push-Dienste senden (Apple, Google, Mozilla, Microsoft), nie an beliebige Adressen
const PUSH_HOSTS = /^(web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)$/i;

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': OK_ORIGINS.includes(origin) ? origin : OK_ORIGINS[0],
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    };
    const reply = (status, o) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!OK_ORIGINS.includes(origin)) return new Response('forbidden', { status: 403, headers: cors });

    const path = new URL(req.url).pathname;
    if (path === '/ping') return reply(200, { ok: !!env.PUSH, kv: !!env.PUSH });
    if (!env.PUSH) return reply(500, { ok: false, code: 'KV', message: 'Dem Worker fehlt der KV-Speicher (Bindung PUSH).' });
    try {
      if (path === '/key' && req.method === 'GET') return reply(200, { key: (await vapid(env, true)).pub });
      if (req.method !== 'POST') return reply(404, { ok: false, code: 'ROUTE', message: 'Unbekannte Adresse.' });
      const b = await body(req);
      if (!b || !okId(b.id)) return reply(400, { ok: false, code: 'INPUT', message: 'Ungültige Anfrage.' });
      if (path === '/save') return reply(200, await save(env, b));
      if (path === '/delete') {
        await env.PUSH.delete('s:' + b.id);
        return reply(200, { ok: true });
      }
      if (path === '/test') return reply(200, await test(env, b.id));
      return reply(404, { ok: false, code: 'ROUTE', message: 'Unbekannte Adresse.' });
    } catch (e) {
      if (e && e.code) return reply(e.code === 'INPUT' ? 400 : 500, { ok: false, code: e.code, message: e.message });
      return reply(500, { ok: false, code: 'ERR', message: 'Fehler im Erinnerungs-Worker.' });
    }
  },

  // Cron „0 * * * *“: alle Geräte erinnern, die diese volle Stunde gewählt haben
  async scheduled(ev, env, ctx) {
    if (env.PUSH) ctx.waitUntil(remind(env, new Date(ev.scheduledTime || Date.now())));
  },
};

const fail = (code, message) => Object.assign(new Error(message), { code });
const okId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(id);

async function body(req) {
  const t = await req.text();
  if (t.length > 32000) throw fail('INPUT', 'Zu viele Daten.');
  try {
    return JSON.parse(t);
  } catch (e) {
    return null;
  }
}

// ---------- Eintrag speichern ----------
function cleanSub(s) {
  const ep = s && typeof s.endpoint === 'string' ? s.endpoint : '';
  let u;
  try {
    u = new URL(ep);
  } catch (e) {
    throw fail('INPUT', 'Ungültige Push-Adresse.');
  }
  if (u.protocol !== 'https:' || !PUSH_HOSTS.test(u.hostname) || ep.length > 1024) throw fail('INPUT', 'Unbekannter Push-Dienst: ' + u.hostname);
  const k = s.keys || {};
  let p, a;
  try {
    p = b64d(k.p256dh);
    a = b64d(k.auth);
  } catch (e) {}
  if (!p || p.length !== 65 || p[0] !== 4 || !a || a.length !== 16) throw fail('INPUT', 'Ungültige Push-Schlüssel.');
  return { endpoint: ep, keys: { p256dh: k.p256dh, auth: k.auth } };
}
const int = (v, lo, hi, d) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);
const line = (v, n) => {
  const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};
const cleanHw = (a) =>
  (Array.isArray(a) ? a : [])
    .filter((h) => h && /^\d{4}-\d{2}-\d{2}$/.test(h.d))
    .slice(0, 60)
    .map((h) => ({ d: h.d, s: line(h.s, 40) || 'Hausaufgabe', t: line(h.t, 160) }));

async function save(env, b) {
  const rec = { sub: cleanSub(b.sub), days: int(b.days, 1, 7, 1), hour: int(b.hour, 0, 23, 17), hw: cleanHw(b.hw), at: Date.now() };
  await env.PUSH.put('s:' + b.id, JSON.stringify(rec), { metadata: { h: rec.hour }, expirationTtl: KEEP });
  const v = await vapid(env, false);
  // key: die App vergleicht ihn mit dem Schlüssel ihres Abos und meldet sich neu an, falls er sich geändert hat
  return { ok: true, key: v ? v.pub : '' };
}

// ---------- Erinnern ----------
async function remind(env, now) {
  const t = berlin(now),
    v = await vapid(env, false);
  if (!v) return { sent: 0 };
  const names = [];
  let cursor;
  do {
    const l = await env.PUSH.list({ prefix: 's:', cursor });
    for (const k of l.keys) if (k.metadata && k.metadata.h === t.hour) names.push(k.name);
    cursor = l.list_complete ? null : l.cursor;
  } while (cursor);
  let sent = 0;
  for (const name of names) {
    try {
      const rec = await env.PUSH.get(name, 'json');
      const msg = rec && rec.hour === t.hour && digest(rec, t.day);
      if (!msg) continue;
      const st = await send(v, rec.sub, msg);
      if (st === 404 || st === 410) await env.PUSH.delete(name); // Abo gibt es nicht mehr
      else if (st < 300) sent++;
    } catch (e) {} // ein kaputter Eintrag soll die anderen nicht aufhalten
  }
  return { sent, checked: names.length };
}

async function test(env, id) {
  const rec = await env.PUSH.get('s:' + id, 'json');
  if (!rec) throw fail('GONE', 'Der Worker kennt dieses Gerät nicht. Schalte die Erinnerungen aus und wieder ein.');
  const v = await vapid(env, false);
  if (!v) throw fail('KEY', 'Dem Worker fehlen die Schlüssel. Schalte die Erinnerungen aus und wieder ein.');
  const d = digest(rec, berlin(new Date()).day),
    msg = d
      ? Object.assign(d, { title: 'Test: ' + d.title })
      : {
          title: 'Test: Erinnerungen sind an',
          body: `Gerade ist nichts in den nächsten ${rec.days === 1 ? 'Tag' : rec.days + ' Tagen'} fällig. Du hörst täglich um ${rec.hour} Uhr von mir, sobald etwas ansteht.`,
          tag: 'hausaufgaben',
          url: '#un',
        };
  const st = await send(v, rec.sub, msg);
  if (st === 404 || st === 410) {
    await env.PUSH.delete('s:' + id);
    throw fail('GONE', 'Das Gerät ist beim Push-Dienst nicht mehr angemeldet. Schalte die Erinnerungen aus und wieder ein.');
  }
  if (st >= 300) throw fail('PUSH', 'Der Push-Dienst hat die Mitteilung abgelehnt (Status ' + st + ').');
  return { ok: true };
}

// ---------- Text der Mitteilung ----------
// Erinnert an alles, was ab morgen bis in `days` Tagen fällig ist. Heute Fälliges ist schon vorbei.
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
function addDay(s, n) {
  const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10) + n));
  return d.toISOString().slice(0, 10);
}
function when(d, today) {
  if (d === addDay(today, 1)) return 'Morgen';
  if (d === addDay(today, 2)) return 'Übermorgen';
  const x = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)));
  return WD[x.getUTCDay()] + ' ' + x.getUTCDate() + '.' + (x.getUTCMonth() + 1) + '.';
}
function digest(rec, today) {
  const a = addDay(today, 1),
    b = addDay(today, rec.days || 1),
    hw = (rec.hw || []).filter((h) => h.d >= a && h.d <= b).sort((x, y) => x.d.localeCompare(y.d) || x.s.localeCompare(y.s));
  if (!hw.length) return null;
  const n = hw.length,
    soon = hw.every((h) => h.d === a),
    MAX = 4,
    rows = hw.slice(0, n > MAX ? MAX - 1 : MAX).map((h) => when(h.d, today) + ': ' + h.s + (h.t ? ' – ' + line(h.t, 70) : ''));
  if (n > MAX) rows.push('+ ' + (n - MAX + 1) + ' weitere');
  return {
    title: soon ? (n === 1 ? 'Hausaufgabe für morgen' : n + ' Hausaufgaben für morgen') : n === 1 ? '1 Hausaufgabe steht an' : n + ' Hausaufgaben stehen an',
    body: rows.join('\n'),
    tag: 'hausaufgaben',
    url: '#un',
  };
}

// Datum und volle Stunde in Deutschland (Sommer-/Winterzeit macht Intl)
function berlin(d) {
  const p = {};
  for (const x of new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d)) p[x.type] = x.value;
  return { day: p.year + '-' + p.month + '-' + p.day, hour: +p.hour % 24 };
}

// ---------- Web Push: VAPID (RFC 8292) und Verschlüsselung (RFC 8291, aes128gcm) ----------
const te = new TextEncoder();
const b64u = (u8) => {
  let s = '';
  for (const c of u8) s += String.fromCharCode(c);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64d = (s) => {
  const b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const cat = (...a) => {
  const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0));
  let i = 0;
  for (const x of a) out.set(x, i), (i += x.length);
  return out;
};

// Schlüsselpaar für die Absenderkennung. Nur /key legt es an (sonst könnte ein Cron-Lauf, der den frischen
// Eintrag im KV noch nicht sieht, ein zweites erzeugen und alle Abos ungültig machen).
async function vapid(env, create) {
  let v = await env.PUSH.get('vapid', 'json');
  if (!v) {
    if (!create) return null;
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    v = { jwk: await crypto.subtle.exportKey('jwk', kp.privateKey), pub: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))) };
    await env.PUSH.put('vapid', JSON.stringify(v));
  }
  return { pub: v.pub, jwk: v.jwk };
}
async function jwt(v, aud) {
  const key = await crypto.subtle.importKey('jwk', v.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']),
    enc = (o) => b64u(te.encode(JSON.stringify(o))),
    head = enc({ typ: 'JWT', alg: 'ES256' }) + '.' + enc({ aud, exp: Math.floor(Date.now() / 1000) + 1800, sub: SUBJECT }),
    sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(head));
  return head + '.' + b64u(new Uint8Array(sig));
}
// fix (nur für Tests): { salt, key } statt Zufall, damit das Beispiel aus RFC 8291 nachgerechnet werden kann
async function encrypt(p256dh, auth, data, fix) {
  const ua = b64d(p256dh),
    secret = b64d(auth),
    salt = fix ? fix.salt : crypto.getRandomValues(new Uint8Array(16)),
    as = fix ? fix.key : await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']),
    asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey)),
    uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []),
    shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256)),
    hkdf = async (s, ikm, info, n) =>
      new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: s, info }, await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), n * 8)),
    ikm = await hkdf(secret, shared, cat(te.encode('WebPush: info\0'), ua, asPub), 32),
    cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16),
    nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12),
    key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']),
    ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, cat(data, Uint8Array.of(2)))),
    head = new Uint8Array(21);
  head.set(salt);
  new DataView(head.buffer).setUint32(16, 4096); // Datensatzgröße
  head[20] = asPub.length;
  return cat(head, asPub, ct);
}
async function send(v, sub, msg) {
  const data = te.encode(JSON.stringify(msg));
  if (data.length > 3000) throw fail('PUSH', 'Mitteilung zu lang.');
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      TTL: String(TTL),
      Urgency: 'normal',
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      Authorization: 'vapid t=' + (await jwt(v, new URL(sub.endpoint).origin)) + ', k=' + v.pub,
    },
    body: await encrypt(sub.keys.p256dh, sub.keys.auth, data),
  });
  return r.status;
}
