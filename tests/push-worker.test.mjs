// Prüft worker/push-worker.js ohne Netzwerk und ohne Cloudflare:
//   node tests/push-worker.test.mjs
// Verschlüsselung gegen das Beispiel aus RFC 8291, Entschlüsseln wie ein Browser, VAPID-Signatur, CORS und
// Origin, erlaubte Push-Dienste, Speichern im KV (Attrappe) und die stündliche Erinnerung zur richtigen Uhrzeit.
// Ob Apple/Google die Mitteilung wirklich zustellen, zeigt erst „Test-Mitteilung“ in der App nach dem Deploy.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = path.join(dir, 'tests', '.push-worker-copy.mjs');
// .js ohne package.json gilt nicht als ES-Modul; die inneren Funktionen nur in der Kopie nach außen geben
fs.writeFileSync(tmp, fs.readFileSync(path.join(dir, 'worker', 'push-worker.js'), 'utf8') + '\nexport const _t = { encrypt, digest, berlin, addDay, b64u, b64d };\n');
const mod = await import(pathToFileURL(tmp).href);
fs.unlinkSync(tmp);
const worker = mod.default,
  { encrypt, digest, berlin, b64u, b64d } = mod._t,
  S = crypto.subtle,
  te = new TextEncoder();

let n = 0;
const t = async (name, f) => { await f(); n++; console.log('ok  ' + name); };

// ---------- Hilfen: Browser-Seite (Empfänger) ----------
const jwkOf = (pub, d) => ({ kty: 'EC', crv: 'P-256', x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ...(d ? { d } : {}) });
async function receiver() {
  const kp = await S.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return { kp, p256dh: b64u(new Uint8Array(await S.exportKey('raw', kp.publicKey))), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) };
}
// Entschlüsseln nach RFC 8291 (so wie es der Browser tut)
async function decrypt(r, body) {
  body = new Uint8Array(body);
  const salt = body.slice(0, 16), rs = new DataView(body.buffer, body.byteOffset).getUint32(16), idlen = body[20],
    asPub = body.slice(21, 21 + idlen), ct = body.slice(21 + idlen), ua = b64d(r.p256dh);
  assert.equal(rs, 4096);
  assert.equal(idlen, 65);
  const asKey = await S.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []),
    shared = new Uint8Array(await S.deriveBits({ name: 'ECDH', public: asKey }, r.kp.privateKey, 256)),
    hk = async (s, ikm, info, len) => new Uint8Array(await S.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: s, info }, await S.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), len * 8)),
    cat = (...a) => Uint8Array.from(a.flatMap((x) => [...x])),
    ikm = await hk(b64d(r.auth), shared, cat(te.encode('WebPush: info\0'), ua, asPub), 32),
    cek = await hk(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16),
    nonce = await hk(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12),
    pt = new Uint8Array(await S.decrypt({ name: 'AES-GCM', iv: nonce }, await S.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), ct));
  let end = pt.length - 1;
  while (pt[end] === 0) end--;
  assert.equal(pt[end], 2, 'Trenner 0x02 am Ende des letzten Datensatzes');
  return new TextDecoder().decode(pt.slice(0, end));
}

// ---------- Attrappen: KV, Push-Dienst, Origin ----------
function kv() {
  const m = new Map();
  return {
    m,
    async get(k, type) { const e = m.get(k); return e ? (type === 'json' ? JSON.parse(e.v) : e.v) : null; },
    async put(k, v, o = {}) { m.set(k, { v, metadata: o.metadata, ttl: o.expirationTtl }); },
    async delete(k) { m.delete(k); },
    async list({ prefix = '', cursor } = {}) {
      const all = [...m.keys()].filter((k) => k.startsWith(prefix)).sort(), from = cursor ? +cursor : 0, page = all.slice(from, from + 2); // kleine Seiten: Blättern mitprüfen
      return { keys: page.map((name) => ({ name, metadata: m.get(name).metadata })), list_complete: from + 2 >= all.length, cursor: String(from + 2) };
    },
  };
}
let pushes = [], pushStatus = 201;
globalThis.fetch = async (url, init) => { pushes.push({ url: String(url), init }); return new Response('', { status: typeof pushStatus === 'function' ? pushStatus(url) : pushStatus }); };
const PAGES = 'https://maximilian-stapper.github.io', W = 'https://push-worker.maximilian-stapper.workers.dev';
const ask = (env, p, o = {}) =>
  worker.fetch(new Request(W + p, { method: o.method || (o.body ? 'POST' : 'GET'), headers: { ...(o.origin === null ? {} : { Origin: o.origin || PAGES }), 'Content-Type': 'application/json' }, body: o.body ? JSON.stringify(o.body) : undefined }), env);
const cron = async (env, iso) => {
  const jobs = [];
  await worker.scheduled({ scheduledTime: Date.parse(iso) }, env, { waitUntil: (p) => jobs.push(p) });
  return (await Promise.all(jobs))[0];
};
const ID = 'abcdefghijklmnopqrstuv', ID2 = 'ZYXWVUTSRQPONMLKJIHGFE';

// ---------- Tests ----------
await t('Verschlüsselung ergibt exakt das Beispiel aus RFC 8291, Abschnitt 5', async () => {
  const asPub = b64d('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8'),
    key = {
      publicKey: await S.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, true, []),
      privateKey: await S.importKey('jwk', jwkOf(asPub, 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']),
    },
    out = await encrypt('BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', 'BTBZMqHH6r4Tts7J_aSIgg', te.encode('When I grow up, I want to be a watermelon'), { salt: b64d('DGv6ra1nlYgDCS1FRnbzlw'), key });
  assert.equal(
    b64u(out),
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
  );
});

await t('Preflight und Aufrufe: nur von GitHub Pages, fremde Seiten und fehlender Origin bekommen 403', async () => {
  const env = { PUSH: kv() };
  const p = await ask(env, '/ping', { method: 'OPTIONS' });
  assert.equal(p.status, 204);
  assert.equal(p.headers.get('Access-Control-Allow-Origin'), PAGES);
  assert.match(p.headers.get('Access-Control-Allow-Headers'), /Content-Type/);
  assert.notEqual((await ask(env, '/ping', { method: 'OPTIONS', origin: 'https://evil.example' })).headers.get('Access-Control-Allow-Origin'), 'https://evil.example');
  for (const o of ['https://evil.example', null, 'https://maximilian-stapper.github.io.evil.example'])
    for (const r of ['/ping', '/key', '/save', '/delete', '/test']) assert.equal((await ask(env, r, { origin: o, body: r.length > 4 ? { id: ID } : undefined })).status, 403, o + r);
  assert.equal(env.PUSH.m.size, 0);
});

await t('/ping meldet fehlenden KV-Speicher, /key erzeugt die Schlüssel einmal und bleibt dabei', async () => {
  assert.deepEqual(await (await ask({}, '/ping')).json(), { ok: false, kv: false });
  assert.equal((await ask({}, '/key')).status, 500);
  const env = { PUSH: kv() };
  assert.deepEqual(await (await ask(env, '/ping')).json(), { ok: true, kv: true });
  const k1 = (await (await ask(env, '/key')).json()).key, k2 = (await (await ask(env, '/key')).json()).key;
  assert.equal(k1, k2);
  assert.equal(b64d(k1).length, 65);
  assert.equal(b64d(k1)[0], 4);
});

const env = { PUSH: kv() };
const vapidKey = (await (await ask(env, '/key')).json()).key;
const r1 = await receiver(), r2 = await receiver();
const sub = (r, host = 'web.push.apple.com') => ({ endpoint: 'https://' + host + '/QGuQyavXutnMH0_' + Math.random().toString(36).slice(2), keys: { p256dh: r.p256dh, auth: r.auth } });
const S1 = sub(r1), S2 = sub(r2, 'fcm.googleapis.com');
const hw = [
  { d: '2026-11-25', s: 'Mathe', t: 'S. 34 Nr. 5' },
  { d: '2026-11-25', s: 'Deutsch', t: 'Gedicht   lesen\nund markieren' },
  { d: '2026-11-27', s: 'Englisch', t: 'Vokabeln Unit 3' },
  { d: '2026-12-10', s: 'Bio', t: 'Referat' },
  { d: '2026-11-24', s: 'Physik', t: 'heute fällig' },
];

await t('/save: nur echte Push-Dienste, gültige Schlüssel und Zufalls-IDs; Werte werden begrenzt', async () => {
  for (const bad of [
    { id: 'kurz', sub: S1 },
    { id: ID, sub: { ...S1, endpoint: 'https://evil.example/push' } },
    { id: ID, sub: { ...S1, endpoint: 'http://web.push.apple.com/x' } },
    { id: ID, sub: { ...S1, endpoint: 'https://web.push.apple.com.evil.example/x' } },
    { id: ID, sub: { ...S1, keys: { p256dh: 'AAAA', auth: S1.keys.auth } } },
    { id: ID, sub: { ...S1, keys: { p256dh: S1.keys.p256dh } } },
  ]) assert.equal((await ask(env, '/save', { body: bad })).status, 400, JSON.stringify(bad).slice(0, 80));
  assert.equal(env.PUSH.m.size, 1); // nur „vapid“
  const r = await (await ask(env, '/save', { body: { id: ID, sub: S1, days: 99, hour: -3, hw: [...hw, { d: 'morgen', s: 'x' }, { d: '2026-11-26', s: 'K'.repeat(90), t: 'x'.repeat(500) }] } })).json();
  assert.deepEqual(r, { ok: true, key: vapidKey });
  const e = env.PUSH.m.get('s:' + ID), rec = JSON.parse(e.v);
  assert.equal(rec.days, 1);
  assert.equal(rec.hour, 17);
  assert.deepEqual(e.metadata, { h: 17 });
  assert.equal(e.ttl, 60 * 86400);
  assert.equal(rec.hw.length, 6); // „morgen“ ist kein Datum
  assert.equal(rec.hw[1].t, 'Gedicht lesen und markieren');
  assert.equal(rec.hw[5].s.length, 40);
  assert.equal(rec.hw[5].t.length, 160);
  assert.deepEqual(Object.keys(rec).sort(), ['at', 'days', 'hour', 'hw', 'sub']);
});

await t('Text der Mitteilung: ab morgen bis „Tage vorher“, Heutiges und Späteres fehlen', async () => {
  const today = '2026-11-24';
  assert.equal(digest({ days: 1, hw: [{ d: '2026-11-24', s: 'A', t: '' }] }, today), null);
  const a = digest({ days: 1, hw }, today);
  assert.equal(a.title, '2 Hausaufgaben für morgen');
  assert.equal(a.body, 'Morgen: Deutsch – Gedicht lesen und markieren\nMorgen: Mathe – S. 34 Nr. 5');
  const b = digest({ days: 3, hw }, today);
  assert.equal(b.title, '3 Hausaufgaben stehen an');
  assert.match(b.body, /^Morgen: Deutsch/);
  assert.match(b.body, /Fr 27\.11\.: Englisch – Vokabeln Unit 3$/);
  const c = digest({ days: 7, hw: Array.from({ length: 6 }, (_, i) => ({ d: '2026-11-26', s: 'F' + i, t: '' })) }, today);
  assert.equal(c.body.split('\n').length, 4);
  assert.match(c.body, /\n\+ 3 weitere$/);
  assert.match(c.body, /^Übermorgen: F0/);
  assert.equal(digest({ days: 1, hw: [{ d: '2026-11-25', s: 'Mathe', t: '' }] }, today).title, 'Hausaufgabe für morgen');
  assert.equal(digest({ days: 7, hw: [{ d: '2026-11-30', s: 'Mathe', t: '' }] }, today).title, '1 Hausaufgabe steht an');
  assert.equal(digest({ days: 7, hw: [{ d: '2027-01-01', s: 'M', t: '' }] }, '2026-12-31').body, 'Morgen: M'); // Jahreswechsel
});

await t('Uhrzeit in Deutschland: Winter- und Sommerzeit', async () => {
  assert.deepEqual(berlin(new Date('2026-11-24T16:00:00Z')), { day: '2026-11-24', hour: 17 });
  assert.deepEqual(berlin(new Date('2026-07-01T16:00:00Z')), { day: '2026-07-01', hour: 18 });
  assert.deepEqual(berlin(new Date('2026-11-24T23:00:00Z')), { day: '2026-11-25', hour: 0 });
});

await t('/test schickt sofort eine verschlüsselte Mitteilung, die der Browser lesen kann; VAPID-Signatur stimmt', async () => {
  pushes = [];
  const r = await ask(env, '/test', { body: { id: ID } });
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal(pushes.length, 1);
  const p = pushes[0], h = p.init.headers;
  assert.equal(p.url, S1.endpoint);
  assert.equal(h['Content-Encoding'], 'aes128gcm');
  assert.equal(h.TTL, String(6 * 3600));
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(h.Authorization);
  assert.ok(m, h.Authorization);
  assert.equal(m[2], vapidKey);
  const [hd, cl, sig] = m[1].split('.'), claims = JSON.parse(new TextDecoder().decode(b64d(cl)));
  assert.deepEqual(JSON.parse(new TextDecoder().decode(b64d(hd))), { typ: 'JWT', alg: 'ES256' });
  assert.equal(claims.aud, 'https://web.push.apple.com');
  assert.equal(claims.sub, 'https://maximilian-stapper.github.io');
  const left = claims.exp - Date.now() / 1000;
  assert.ok(left > 600 && left <= 86400, 'exp ' + left);
  const pub = await S.importKey('raw', b64d(vapidKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.ok(await S.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64d(sig), te.encode(hd + '.' + cl)), 'Signatur');
  const msg = JSON.parse(await decrypt(r1, p.init.body));
  assert.match(msg.title, /^Test: /);
  assert.equal(msg.tag, 'hausaufgaben');
  assert.equal(msg.url, '#un');
  assert.equal(typeof msg.body, 'string');
});

await t('/test meldet Fehler verständlich: unbekanntes Gerät, Abo weg (410 → Eintrag gelöscht), Push-Dienst lehnt ab', async () => {
  let r = await ask(env, '/test', { body: { id: ID2 } });
  assert.equal((await r.json()).code, 'GONE');
  await ask(env, '/save', { body: { id: ID2, sub: S2, days: 2, hour: 17, hw } });
  pushStatus = 403;
  r = await (await ask(env, '/test', { body: { id: ID2 } })).json();
  assert.equal(r.code, 'PUSH');
  assert.match(r.message, /403/);
  pushStatus = 410;
  r = await (await ask(env, '/test', { body: { id: ID2 } })).json();
  assert.equal(r.code, 'GONE');
  assert.equal(env.PUSH.m.has('s:' + ID2), false);
  pushStatus = 201;
});

await t('Cron: nur Geräte mit dieser Uhrzeit und etwas Fälligem; 410 löscht den Eintrag; Blättern im KV', async () => {
  const e = { PUSH: kv() };
  await ask(e, '/key');
  const rs = [];
  for (let i = 0; i < 5; i++) {
    const r = await receiver();
    rs.push(r);
    await ask(e, '/save', { body: { id: 'dev' + i + 'xxxxxxxxxxxxxxxxxxx', sub: sub(r), days: i === 3 ? 7 : 1, hour: i === 1 ? 18 : 17, hw: i === 2 ? [{ d: '2026-11-30', s: 'X', t: '' }] : hw } });
  }
  // 17 Uhr in Deutschland: Gerät 0, 3, 4 (1 will 18 Uhr, 2 hat morgen nichts)
  pushes = [];
  pushStatus = (url) => (url === pushes[pushes.length - 1].url && pushes.length === 3 ? 410 : 201);
  const r = await cron(e, '2026-11-24T16:00:00Z');
  assert.equal(pushes.length, 3);
  assert.deepEqual(r, { sent: 2, checked: 4 });
  assert.equal(e.PUSH.m.has('s:dev4xxxxxxxxxxxxxxxxxxx'), false); // 410
  assert.equal(JSON.parse(await decrypt(rs[0], pushes[0].init.body)).title, '2 Hausaufgaben für morgen');
  assert.equal(JSON.parse(await decrypt(rs[3], pushes[1].init.body)).title, '3 Hausaufgaben stehen an');
  pushStatus = 201;
  // 18 Uhr: nur Gerät 1; 12 Uhr: niemand
  pushes = [];
  await cron(e, '2026-11-24T17:00:00Z');
  assert.equal(pushes.length, 1);
  pushes = [];
  await cron(e, '2026-11-24T11:00:00Z');
  assert.equal(pushes.length, 0);
  // Ohne Schlüssel (KV-Eintrag „vapid“ fehlt) wird nichts erzeugt und nichts geschickt
  const e2 = { PUSH: kv() };
  await ask(e2, '/save', { body: { id: ID, sub: S1, days: 1, hour: 17, hw } });
  assert.equal(e2.PUSH.m.has('vapid'), false);
  assert.deepEqual(await cron(e2, '2026-11-24T16:00:00Z'), { sent: 0 });
  assert.equal(e2.PUSH.m.has('vapid'), false);
});

await t('/delete löscht den Eintrag', async () => {
  assert.ok(env.PUSH.m.has('s:' + ID));
  assert.equal((await ask(env, '/delete', { body: { id: ID } })).status, 200);
  assert.equal(env.PUSH.m.has('s:' + ID), false);
});

console.log(`\n${n} Prüfungen bestanden`);
