// Prüft untis-worker.js und die Zusammenarbeit mit untis.js, ohne Netzwerk:
//   node tests/untis-worker.test.mjs
// Der Worker läuft hier lokal in Node. Die Anfragen kommen mit dem Origin der GitHub-Pages-Seite,
// WebUntis und die Microsoft-Anmeldung sind durch Attrappen ersetzt. Ob der Worker bei Cloudflare wirklich
// erreichbar ist und Microsoft so antwortet, zeigt erst „Anmelden und abgleichen“ in der App nach dem Deploy.
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
const W = 'https://untis-worker.maximilian-stapper.workers.dev';
const G = '/gaesdonck.webuntis.com/WebUntis';
let calls = [];
let upstream = async () => new Response('{}', { status: 200 });
globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return upstream(url, init); };
const ask = (p, o = {}) =>
  worker.fetch(new Request(W + p, { method: o.method || 'GET', headers: { ...(o.origin === null ? {} : { Origin: o.origin || PAGES }), ...(o.headers || {}) }, body: o.body }));
let n = 0;
const t = async (name, f) => { await f(); n++; console.log('ok  ' + name); };

await t('Preflight von GitHub Pages: 204, Origin erlaubt, Cookie-, Authorization- und Content-Type-Header erlaubt', async () => {
  const r = await ask(G + '/jsonrpc.do', { method: 'OPTIONS' });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), PAGES);
  assert.match(r.headers.get('Access-Control-Allow-Headers'), /X-Untis-Cookie/);
  assert.match(r.headers.get('Access-Control-Allow-Headers'), /Authorization/);
  assert.match(r.headers.get('Access-Control-Allow-Headers'), /Content-Type/);
  assert.match(r.headers.get('Access-Control-Expose-Headers'), /X-Untis-Cookie/);
});
await t('Preflight von fremder Seite: Antwort nennt NICHT deren Origin (Browser blockt)', async () => {
  const r = await ask(G + '/', { method: 'OPTIONS', origin: 'https://evil.example' });
  assert.notEqual(r.headers.get('Access-Control-Allow-Origin'), 'https://evil.example');
});
await t('/ping von GitHub Pages: 200 ok', async () => {
  const r = await ask('/ping');
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'ok');
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), PAGES);
});
await t('/ping, /login und Weiterleitung von fremdem Origin oder ohne Origin: 403, kein Aufruf nach außen', async () => {
  calls = [];
  for (const o of ['https://evil.example', null, 'http://maximilian-stapper.github.io', 'https://maximilian-stapper.github.io.evil.example']) {
    for (const p of ['/ping', '/login', G + '/jsonrpc.do']) assert.equal((await ask(p, { origin: o, method: p === '/login' ? 'POST' : 'GET', body: p === '/login' ? '{}' : undefined })).status, 403, String(o) + ' ' + p);
  }
  assert.equal(calls.length, 0);
});
await t('Nur gaesdonck.webuntis.com/WebUntis als Ziel', async () => {
  calls = [];
  for (const p of ['/evil.com/WebUntis/', '/xyz.webuntis.com/WebUntis/', '/gaesdonck.webuntis.com.evil.com/WebUntis/', '/gaesdonck.webuntis.com@evil.com/WebUntis/', '/gaesdonck.webuntis.com/admin', '/localhost/', '/'])
    assert.equal((await ask(p)).status, 400, p);
  assert.equal(calls.length, 0);
});
await t('POST: Ziel-URL, Query, Body, Cookie und Authorization werden weitergereicht, Set-Cookie kommt als X-Untis-Cookie zurück', async () => {
  calls = [];
  upstream = async () => {
    const h = new Headers({ 'Content-Type': 'application/json' });
    h.append('Set-Cookie', 'JSESSIONID=abc123; Path=/WebUntis; HttpOnly; Secure');
    h.append('Set-Cookie', 'schoolname="_bWVpbmU="; Path=/WebUntis');
    return new Response('{"result":{"personId":7}}', { status: 200, headers: h });
  };
  const r = await ask(G + '/jsonrpc.do?school=gaesdonck', { method: 'POST', body: '{"id":"abi"}', headers: { 'Content-Type': 'application/json', 'X-Untis-Cookie': 'a=1; b=2', Authorization: 'Bearer xyz' } });
  assert.equal(r.status, 200);
  assert.equal(calls[0].url, 'https://gaesdonck.webuntis.com/WebUntis/jsonrpc.do?school=gaesdonck');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body, '{"id":"abi"}');
  assert.equal(calls[0].init.headers.get('Cookie'), 'a=1; b=2');
  assert.equal(calls[0].init.headers.get('Authorization'), 'Bearer xyz');
  assert.equal(r.headers.get('X-Untis-Cookie'), 'JSESSIONID=abc123; schoolname="_bWVpbmU="');
  assert.equal((await r.json()).result.personId, 7);
});
await t('Untis nicht erreichbar: 502 mit CORS-Header (statt CORS-Fehler im Browser)', async () => {
  upstream = async () => { throw new TypeError('network'); };
  const r = await ask(G + '/jsonrpc.do');
  assert.equal(r.status, 502);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), PAGES);
});

// ---------- Attrappe: Untis von Gaesdonck + Microsoft-Anmeldung ----------
const day = (off) => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + off); return +(d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0')); };
const MAIL = 'max.muster@gaesdonck.de', PASS = 'geheim';
let mode = 'ok', msLogins = 0, posted = null, sessionValid = true;
const html = (body, h = {}) => new Response('<html><body>' + body + '</body></html>', { status: 200, headers: { 'Content-Type': 'text/html', ...h } });
const cfg = (o) => html(`<script>//<![CDATA[\n$Config=${JSON.stringify(o)};\n//]]></script>`);
const redirect = (loc, cookies = []) => {
  const h = new Headers({ Location: loc });
  cookies.forEach((c) => h.append('Set-Cookie', c));
  return new Response(null, { status: 302, headers: h });
};
const js = (o, h = {}) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json', ...h } });
const world = async (url, init = {}) => {
  const u = new URL(url), hd = new Headers(init.headers || {}), ck = hd.get('Cookie') || '';
  const form = init.body && /urlencoded/.test(hd.get('Content-Type') || '') ? Object.fromEntries(new URLSearchParams(init.body)) : null;
  if (u.hostname === 'gaesdonck.webuntis.com') {
    const p = u.pathname, has = /JSESSIONID=good/.test(ck) && sessionValid;
    if (p === '/WebUntis/' && u.searchParams.get('school')) {
      const h = new Headers({ 'Content-Type': 'text/html' });
      h.append('Set-Cookie', 'schoolname="_Z2Flc2RvbmNr"; Path=/WebUntis/; Secure');
      h.append('Set-Cookie', 'Tenant-Id="5251900"; Path=/WebUntis/; Secure');
      return new Response('<html>"loginError":""</html>', { status: 200, headers: h });
    }
    if (p === '/WebUntis/oauth2/authorization/office365')
      return redirect('https://login.microsoftonline.com/common/oauth2/authorize?response_type=code&client_id=x&state=abc&redirect_uri=https://o365.webuntis.com/WebUntis/login/oauth2/code/office365', ['traceId=t1; Path=/WebUntis/oauth2/authorization/; Secure']);
    if (p === '/WebUntis/sso/finish') {
      assert.equal(u.searchParams.get('ticket'), 'T-1');
      assert.match(ck, /schoolname=/); // Schul-Cookie aus dem ersten Schritt wird mitgeschickt
      return redirect('/WebUntis/', ['JSESSIONID=good; Path=/WebUntis; HttpOnly; Secure']);
    }
    if (p === '/WebUntis/') return html('"loginError":""');
    if (p === '/WebUntis/api/token/new') return has ? new Response('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjQyfQ.c2ln', { status: 200, headers: { 'Content-Type': 'text/plain' } }) : new Response('', { status: 401 });
    const auth = hd.get('Authorization') === 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjQyfQ.c2ln';
    if (p === '/WebUntis/api/rest/view/v1/app/data') return has && auth ? js({ user: { person: { id: 42, displayName: 'Max Muster' }, roles: ['STUDENT'] } }) : new Response('', { status: 401 });
    if (p === '/WebUntis/api/public/timetable/weekly/data') {
      if (!has) return new Response('', { status: 401 });
      assert.equal(u.searchParams.get('elementType'), '5');
      assert.equal(u.searchParams.get('elementId'), '42');
      const first = u.searchParams.get('date') === Untis.util.mon(Untis.util.today());
      const elements = [
        { type: 3, id: 1, name: 'M-GK1', longName: 'Mathematik' }, { type: 3, id: 2, name: 'Ph-LK1', longName: 'Physik' }, { type: 3, id: 3, name: 'Rk', longName: 'Religion' },
        { type: 2, id: 5, name: 'Mül' }, { type: 4, id: 7, name: '204' }, { type: 1, id: 9, name: '12' },
      ];
      const P = (id, date, s, e, sub, extra = {}) => ({ id, date, startTime: s, endTime: e, elements: [{ type: 3, id: sub }, { type: 2, id: 5 }, { type: 4, id: 7 }, { type: 1, id: 9 }], cellState: 'STANDARD', is: { standard: true }, ...extra });
      return js({ data: { result: { data: { elementIds: [42], elements, elementPeriods: { 42: first ? [
        P(1, day(0), 800, 845, 1), P(2, day(0), 850, 935, 1),
        P(3, day(1), 955, 1040, 2, { cellState: 'CANCEL', is: { cancelled: true } }),
        P(4, day(2), 700, 745, 3, { substText: 'Raumänderung', cellState: 'ROOMSUBSTITUTION', is: { roomSubstitution: true } }),
      ] : [] } } } } });
    }
    if (p === '/WebUntis/api/homeworks/lessons') {
      if (!has) return new Response('', { status: 401 });
      return js({ data: { homeworks: [{ id: 9, lessonId: 1, date: day(0), dueDate: day(3), text: 'S. 45 Nr. 3 <b>a</b>', remark: '', completed: false }], records: [{ homeworkId: 9, teacherId: 5 }], teachers: [{ id: 5, name: 'Mül' }], lessons: [{ id: 1, subject: 'M-GK1' }] } });
    }
    return new Response('nope', { status: 404 });
  }
  if (u.hostname === 'login.microsoftonline.com') {
    if (u.pathname === '/common/oauth2/authorize') {
      assert.match(hd.get('User-Agent') || '', /Mozilla/);
      // Wie echt: erst eine Zwischenseite, die sich mit sso_reload=True neu lädt, dann die Anmeldeseite mit dem harmlosen Code 50058
      if (!u.searchParams.get('sso_reload')) return cfg({ urlPost: u.pathname + u.search + '&sso_reload=True' });
      return cfg({ pgid: 'ConvergedSignIn', urlPost: '/common/login', sCtx: 'CTX1', sFT: 'FT1', canary: 'C1', sessionId: 'S1', sErrorCode: '50058' });
    }
    if (u.pathname === '/common/login') {
      // Wie echt: erst eine „Umleitung“-Seite (50168), die das Formular mit sso_reload=True erneut abschickt
      if (!u.searchParams.get('sso_reload')) return cfg({ urlPost: '/common/login?client-request-id=1&sso_reload=True', stsErrorCode: '50168', sFTName: 'flowToken' });
      posted = form;
      msLogins++;
      if (form.passwd !== PASS) return cfg({ pgid: 'ConvergedSignIn', urlPost: '/common/login', sCtx: 'CTX2', sFT: 'FT2', sErrorCode: '50126' });
      if (mode === 'mfa') return cfg({ pgid: 'ConvergedTFA', urlPost: '/common/SAS/ProcessAuth', sCtx: 'CTX3', sFT: 'FT3', arrUserProofs: [{ authMethodId: 'PhoneAppNotification' }] });
      if (mode === 'adfs') return redirect('https://adfs.irgendwo.example/adfs/ls/?x=1');
      return cfg({ pgid: 'KmsiInterrupt', urlPost: '/kmsi', sCtx: 'CTX4', sFT: 'FT4', canary: 'C4', sessionId: 'S1' });
    }
    if (u.pathname === '/kmsi') {
      assert.equal(form.flowToken, 'FT4');
      assert.equal(form.ctx, 'CTX4');
      // Microsoft schickt zum Schluss ein selbst abschickendes Formular (form_post) an o365.webuntis.com
      return html('<form method="POST" name="hiddenform" action="https://o365.webuntis.com/WebUntis/login/oauth2/code/office365"><input type="hidden" name="code" value="CODE&amp;1" /><input type="hidden" name="state" value="abc" /></form><script>document.forms[0].submit()</script>');
    }
  }
  if (u.hostname === 'o365.webuntis.com' && u.pathname === '/WebUntis/login/oauth2/code/office365') {
    assert.equal(init.method, 'POST');
    assert.deepEqual(Object.fromEntries(new URLSearchParams(init.body)), { code: 'CODE&1', state: 'abc' });
    return redirect('https://gaesdonck.webuntis.com/WebUntis/sso/finish?ticket=T-1');
  }
  throw new Error('Unerwarteter Aufruf: ' + url);
};
const login = (b) => ask('/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

// untis.js im Browser-Nachbau laden (vor den Login-Tests, die Attrappe braucht Untis.util)
const store = {}, sess = {};
const mkStore = (o) => ({ getItem: (k) => o[k] ?? null, setItem: (k, v) => (o[k] = String(v)), removeItem: (k) => delete o[k] });
const ctx = { URL, localStorage: mkStore(store), sessionStorage: mkStore(sess), console, fetch: null };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(dir, 'constants.js'), 'utf8').replace(/^let st = load\(\)[\s\S]*?step = 1;$/m, 'let st = null, W = null, tab = "ov", step = 1;') + '\n' + fs.readFileSync(path.join(dir, 'untis.js'), 'utf8') + '\n;this.Untis = Untis;', ctx);
const Untis = ctx.Untis;

globalThis.fetch = (url, init) => world(url, init);

await t('/login: ganzer Microsoft-Ablauf (Anmeldeseite → Passwort → „Angemeldet bleiben“ → form_post → Untis), Sitzung kommt als X-Untis-Cookie', async () => {
  mode = 'ok';
  const r = await login({ email: MAIL, password: PASS });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), PAGES);
  const ck = r.headers.get('X-Untis-Cookie');
  assert.match(ck, /JSESSIONID=good/);
  assert.match(ck, /schoolname=/);
  assert.doesNotMatch(ck, /geheim/);
  assert.equal(posted.login, MAIL); assert.equal(posted.loginfmt, MAIL); assert.equal(posted.passwd, PASS);
  assert.equal(posted.ctx, 'CTX1'); assert.equal(posted.flowToken, 'FT1'); assert.equal(posted.canary, 'C1');
});
await t('/login: falsches Passwort → 401 AUTH mit deutscher Meldung', async () => {
  const r = await login({ email: MAIL, password: 'falsch' });
  assert.equal(r.status, 401);
  const j = await r.json();
  assert.equal(j.code, 'AUTH'); assert.match(j.message, /falsch/);
  assert.equal(r.headers.get('X-Untis-Cookie'), null);
});
await t('/login: Konto mit MFA → Code MFA mit Hinweis auf andere Wege', async () => {
  mode = 'mfa';
  const j = await (await login({ email: MAIL, password: PASS })).json();
  assert.equal(j.code, 'MFA'); assert.match(j.message, /Kalender-Link/);
});
await t('/login: Weiterleitung auf fremden Anmeldeserver (ADFS) wird nicht verfolgt', async () => {
  mode = 'adfs';
  const before = calls.length;
  const j = await (await login({ email: MAIL, password: PASS })).json();
  assert.equal(j.code, 'FEDERATED');
  mode = 'ok';
});
await t('/login: ungültige Eingaben → 400, kein Aufruf nach außen', async () => {
  let hit = false;
  globalThis.fetch = async () => { hit = true; throw new Error('darf nicht passieren'); };
  for (const b of [{}, { email: 'kein-at', password: 'x' }, { email: MAIL }, { email: MAIL, password: 'x'.repeat(300) }]) assert.equal((await login(b)).status, 400, JSON.stringify(b));
  assert.equal((await ask('/login', { method: 'POST', body: 'kein json' })).status, 400);
  assert.equal((await ask('/login')).status, 405);
  assert.equal(hit, false);
  globalThis.fetch = (url, init) => world(url, init);
});

// ---------- Ganze Kette: untis.js → Worker → Microsoft/Untis-Attrappe ----------
// Browser-Fetch → Worker (mit Origin der GitHub-Pages-Seite)
ctx.fetch = (url, init = {}) => worker.fetch(new Request(url, { ...init, headers: { ...(init.headers || {}), Origin: PAGES } }));

await t('Feste Adressen: Server, Schule und Worker stehen fest und lassen sich nicht verstellen', async () => {
  const c = Untis.configure({ url: 'https://xyz.webuntis.com/WebUntis/?school=andere', proxy: 'https://evil.example', server: 'x', email: '  ' + MAIL + ' ' });
  assert.equal(c.server, 'gaesdonck.webuntis.com'); assert.equal(c.school, 'gaesdonck'); assert.equal(c.proxy, W);
  assert.equal(c.email, MAIL); assert.equal(c.provider, 'ms');
});
await t('Untis.sync mit Microsoft: Anmeldung, Stundenplan (Wochen-Schnittstelle), Hausaufgaben', async () => {
  msLogins = 0;
  const r = await Untis.sync({ pass: PASS });
  assert.equal(msLogins, 1);
  assert.equal(r.lessons, 4); assert.equal(r.homework, 1); assert.equal(r.warn.length, 0);
  assert.equal(Untis.status().connected, true); assert.equal(Untis.status().who, 'Max Muster');
  const mon = Untis.util.mon(Untis.util.today()), d = Untis.day(mon);
  assert.equal(d[0].sub, 'ma'); assert.equal(d[0].start, '08:00'); assert.equal(d[0].teacher, 'Mül'); assert.equal(d[0].room, '204');
  assert.equal(Untis.day(mon, { merge: 10 }).length, 1);
  assert.equal(Untis.day(Untis.util.add(mon, 1))[0].status, 'cancelled');
  assert.equal(Untis.day(Untis.util.add(mon, 2))[0].status, 'changed');
  assert.equal(Untis.homework()[0].sub, 'ma');
  assert.equal(Untis.homework()[0].text, 'S. 45 Nr. 3 <b>a</b>'); // Rohtext, die Oberfläche maskiert ihn mit esc()
  assert.deepEqual(Array.from(Untis.unmapped()), ['Rk']);
  assert.ok(!JSON.stringify(store).includes(PASS), 'Passwort darf nicht gespeichert werden');
  assert.match(JSON.stringify(sess), /JSESSIONID/); // Sitzung nur in sessionStorage
});
await t('Zweiter Abgleich nutzt die Sitzung (keine neue Microsoft-Anmeldung, kein Passwort nötig)', async () => {
  msLogins = 0;
  await Untis.sync({});
  assert.equal(msLogins, 0);
});
await t('Sitzung bei Untis abgelaufen: ohne Passwort NEED_LOGIN, mit Passwort neue Anmeldung', async () => {
  sessionValid = false;
  await assert.rejects(Untis.sync({}), (e) => e.code === 'NEED_LOGIN');
  sessionValid = true;
  msLogins = 0;
  await Untis.sync({ pass: PASS });
  assert.equal(msLogins, 1);
});
await t('Falsches Microsoft-Passwort: Fehlercode AUTH mit deutscher Meldung', async () => {
  await Untis.logout();
  await assert.rejects(Untis.sync({ pass: 'falsch' }), (e) => e.code === 'AUTH' && /falsch/i.test(e.message));
  assert.equal(Untis.status().connected, false);
});
await t('Alter Worker ohne /login: verständlicher Hinweis zum Neu-Deployen', async () => {
  const keep = ctx.fetch;
  ctx.fetch = async () => new Response('bad host', { status: 400 });
  await assert.rejects(Untis.sync({ pass: PASS }), (e) => e.code === 'OLD_WORKER' && /deployen/.test(e.message));
  ctx.fetch = keep;
});
await t('Fach zuordnen: Rk → re', async () => {
  Untis.configure({ subjectMap: { Rk: 're' } });
  assert.equal(Untis.unmapped().length, 0);
});
await t('Backup enthält keine E-Mail, keinen Benutzernamen und kein Passwort; Wiederherstellen behält die E-Mail', async () => {
  const b = JSON.stringify(Untis.backup());
  assert.ok(!b.includes(PASS)); assert.ok(!b.includes(MAIL));
  assert.equal(Untis.backup().cfg.user, ''); assert.equal(Untis.backup().cfg.email, '');
  assert.equal(Untis.restore(JSON.parse(b)), true);
  assert.equal(Untis.configure().email, MAIL);
});
console.log('\n' + n + ' Tests bestanden');
