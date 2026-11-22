// Prüft untis-worker.js und die Zusammenarbeit mit untis.js, ohne Netzwerk:
//   node tests/untis-worker.test.mjs
// Der Worker läuft hier lokal in Node. Die Anfragen kommen mit dem Origin der GitHub-Pages-Seite,
// WebUntis ist durch eine Attrappe ersetzt. Ob der Worker bei Cloudflare wirklich erreichbar ist,
// zeigt erst „Proxy prüfen“ in der App nach dem Deploy.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = path.join(dir, 'tests', '.worker-copy.mjs');
fs.copyFileSync(path.join(dir, 'worker', 'untis-worker.js'), tmp); // .js ohne package.json gilt nicht als ES-Modul
const worker = (await import(pathToFileURL(tmp).href)).default;
fs.unlinkSync(tmp);

const PAGES = 'https://maximilian-stapper.github.io';
const W = 'https://untis.example.workers.dev';
let calls = [];
let upstream = async () => new Response('{}', { status: 200 });
globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return upstream(url, init); };
const ask = (p, o = {}) =>
  worker.fetch(new Request(W + p, { method: o.method || 'GET', headers: { ...(o.origin === null ? {} : { Origin: o.origin || PAGES }), ...(o.headers || {}) }, body: o.body }));
let n = 0;
const t = async (name, f) => { await f(); n++; console.log('ok  ' + name); };

await t('Preflight von GitHub Pages: 204, Origin erlaubt, Cookie-Header und Content-Type erlaubt', async () => {
  const r = await ask('/x.webuntis.com/WebUntis/jsonrpc.do', { method: 'OPTIONS' });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), PAGES);
  assert.match(r.headers.get('Access-Control-Allow-Headers'), /X-Untis-Cookie/);
  assert.match(r.headers.get('Access-Control-Allow-Headers'), /Content-Type/);
  assert.match(r.headers.get('Access-Control-Expose-Headers'), /X-Untis-Cookie/);
});
await t('Preflight von fremder Seite: Antwort nennt NICHT deren Origin (Browser blockt)', async () => {
  const r = await ask('/x.webuntis.com/WebUntis/', { method: 'OPTIONS', origin: 'https://evil.example' });
  assert.notEqual(r.headers.get('Access-Control-Allow-Origin'), 'https://evil.example');
});
await t('/ping von GitHub Pages: 200 ok', async () => {
  const r = await ask('/ping');
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'ok');
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), PAGES);
});
await t('/ping und Weiterleitung von fremdem Origin oder ohne Origin: 403, kein Aufruf an Untis', async () => {
  calls = [];
  for (const o of ['https://evil.example', null, 'http://maximilian-stapper.github.io', 'https://maximilian-stapper.github.io.evil.example']) {
    for (const p of ['/ping', '/x.webuntis.com/WebUntis/jsonrpc.do']) assert.equal((await ask(p, { origin: o })).status, 403, String(o) + ' ' + p);
  }
  assert.equal(calls.length, 0);
});
await t('Nur *.webuntis.com als Ziel', async () => {
  calls = [];
  for (const p of ['/evil.com/WebUntis/', '/x.webuntis.com.evil.com/WebUntis/', '/x.webuntis.com@evil.com/', '/localhost/', '/', '/x.webuntis.com/../../evil.com/a'])
    assert.equal((await ask(p)).status, 400, p);
  assert.equal(calls.length, 0);
});
await t('POST: Ziel-URL, Query, Body und Cookie werden weitergereicht, Set-Cookie kommt als X-Untis-Cookie zurück', async () => {
  calls = [];
  upstream = async () => {
    const h = new Headers({ 'Content-Type': 'application/json' });
    h.append('Set-Cookie', 'JSESSIONID=abc123; Path=/WebUntis; HttpOnly; Secure');
    h.append('Set-Cookie', 'schoolname="_bWVpbmU="; Path=/WebUntis');
    return new Response('{"result":{"personId":7}}', { status: 200, headers: h });
  };
  const r = await ask('/xyz.webuntis.com/WebUntis/jsonrpc.do?school=meine', { method: 'POST', body: '{"id":"abi"}', headers: { 'Content-Type': 'application/json', 'X-Untis-Cookie': 'a=1; b=2' } });
  assert.equal(r.status, 200);
  assert.equal(calls[0].url, 'https://xyz.webuntis.com/WebUntis/jsonrpc.do?school=meine');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body, '{"id":"abi"}');
  assert.equal(calls[0].init.headers.get('Cookie'), 'a=1; b=2');
  assert.equal(r.headers.get('X-Untis-Cookie'), 'JSESSIONID=abc123; schoolname="_bWVpbmU="');
  assert.equal((await r.json()).result.personId, 7);
});
await t('Untis nicht erreichbar: 502 mit CORS-Header (statt CORS-Fehler im Browser)', async () => {
  upstream = async () => { throw new TypeError('network'); };
  const r = await ask('/xyz.webuntis.com/WebUntis/jsonrpc.do');
  assert.equal(r.status, 502);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), PAGES);
});

// ---------- Ganze Kette: untis.js → Worker → WebUntis-Attrappe ----------
const store = {};
const ctx = { URL, localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k] }, console, fetch: null };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(dir, 'constants.js'), 'utf8').replace(/^let st = load\(\)[\s\S]*?step = 1;$/m, 'let st = null, W = null, tab = "ov", step = 1;') + '\n' + fs.readFileSync(path.join(dir, 'untis.js'), 'utf8') + '\n;this.Untis = Untis;', ctx);
const Untis = ctx.Untis;
const day = (off) => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + off); return +(d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0')); };
let sessions = new Set(), logins = 0;
const untisServer = async (url, init) => {
  const u = new URL(url), ck = init.headers.get('Cookie') || '', has = /JSESSIONID=good/.test(ck);
  const js = (o, h = {}) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json', ...h } });
  if (u.pathname.endsWith('/jsonrpc.do')) {
    const b = JSON.parse(init.body);
    if (b.method === 'authenticate') {
      if (b.params.password !== 'geheim') return js({ error: { code: -8504, message: 'bad credentials' } });
      logins++;
      const h = new Headers({ 'Content-Type': 'application/json' });
      h.append('Set-Cookie', 'JSESSIONID=good; Path=/WebUntis; HttpOnly');
      return new Response(JSON.stringify({ result: { personType: 5, personId: 42 } }), { status: 200, headers: h });
    }
    if (!has || sessions.has('expired')) return js({ error: { code: -8520, message: 'not authenticated' } });
    if (b.method === 'getTimetable')
      return js({ result: [
        { id: 1, date: day(0), startTime: 800, endTime: 845, su: [{ name: 'M-GK1', longname: 'Mathematik' }], te: [{ name: 'Mül' }], ro: [{ name: '204' }], kl: [{ name: '12' }] },
        { id: 2, date: day(0), startTime: 850, endTime: 935, su: [{ name: 'M-GK1', longname: 'Mathematik' }], te: [{ name: 'Mül' }], ro: [{ name: '204' }], kl: [{ name: '12' }] },
        { id: 3, date: day(1), startTime: 955, endTime: 1040, su: [{ name: 'Ph-LK1', longname: 'Physik' }], te: [{ name: 'Sch' }], ro: [{ name: 'PH1' }], code: 'cancelled', kl: [] },
        { id: 4, date: day(2), startTime: 700, endTime: 745, su: [{ name: 'Rk', longname: 'Religion' }], te: [], ro: [], kl: [] },
      ] });
    if (b.method === 'logout') return js({ result: null });
  }
  if (u.pathname.endsWith('/api/homeworks/lessons')) {
    if (!has) return new Response('', { status: 401 });
    return js({ data: { homeworks: [{ id: 9, lessonId: 1, date: day(0), dueDate: day(3), text: 'S. 45 Nr. 3 <b>a</b>', remark: '', completed: false }], records: [{ homeworkId: 9, teacherId: 5 }], teachers: [{ id: 5, name: 'Mül' }], lessons: [{ id: 1, subject: 'M-GK1' }] } });
  }
  return new Response('nope', { status: 404 });
};
// Browser-Fetch → Worker (mit Origin der GitHub-Pages-Seite), Worker-Fetch → Untis-Attrappe
ctx.fetch = (url, init = {}) => worker.fetch(new Request(url, { ...init, headers: { ...(init.headers || {}), Origin: PAGES } }));
globalThis.fetch = (url, init) => untisServer(url, { ...init, headers: new Headers(init.headers) });

await t('Untis.sync über den Worker: Anmeldung, Stundenplan, Hausaufgaben, Cookie-Weitergabe', async () => {
  Untis.configure({ url: 'https://xyz.webuntis.com/WebUntis/?school=meine-schule', proxy: W, user: 'max' });
  const r = await Untis.sync({ pass: 'geheim' });
  assert.equal(r.lessons, 4); assert.equal(r.homework, 1); assert.equal(r.warn.length, 0);
  assert.equal(Untis.status().connected, true);
  const today = Untis.util.today(), mon = Untis.util.mon(today);
  const d = Untis.day(mon);
  assert.equal(d[0].sub, 'ma'); assert.equal(d[0].start, '08:00'); assert.equal(Untis.day(mon, { merge: 10 }).length, 1);
  assert.equal(Untis.day(Untis.util.add(mon, 1))[0].status, 'cancelled');
  assert.equal(Untis.homework()[0].sub, 'ma');
  assert.equal(Untis.homework()[0].text, 'S. 45 Nr. 3 <b>a</b>'); // Rohtext, die Oberfläche maskiert ihn mit esc()
  assert.deepEqual(Array.from(Untis.unmapped()), ['Rk']);
});
await t('Zweiter Abgleich nutzt die Sitzung (kein neues Login, kein Passwort nötig)', async () => {
  const before = logins;
  await Untis.sync({});
  assert.equal(logins, before);
});
await t('Falsches Passwort: Fehlercode AUTH mit deutscher Meldung', async () => {
  await Untis.logout();
  await assert.rejects(Untis.sync({ pass: 'falsch' }), (e) => e.code === 'AUTH' && /falsch/i.test(e.message));
});
await t('Ohne Sitzung und ohne Passwort: NEED_LOGIN', async () => {
  await assert.rejects(Untis.sync({}), (e) => e.code === 'NEED_LOGIN');
});
await t('Fach zuordnen: Rk → re', async () => {
  Untis.configure({ subjectMap: { Rk: 're' } });
  assert.equal(Untis.unmapped().length, 0);
});
await t('Backup enthält keinen Benutzernamen und kein Passwort', async () => {
  const b = JSON.stringify(Untis.backup());
  assert.ok(!b.includes('geheim')); assert.equal(Untis.backup().cfg.user, '');
});
console.log('\n' + n + ' Tests bestanden');
