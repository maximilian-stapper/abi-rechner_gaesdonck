// Prüft den Aufrufzähler ohne Netzwerk und ohne Cloudflare:
//   node tests/count-worker.test.mjs        (braucht Node 22.5 oder neuer, wegen node:sqlite)
// Teil 1: worker/count-worker.js gegen eine echte SQLite-Datenbank (Attrappe der D1-Schnittstelle): CORS und
// Origin, Zählen (eine einzige Gesamtzahl), gleichzeitige Aufrufe, fehlende Datenbank.
// Teil 2: counter.js in der App: wann gezählt, wann nur gelesen und wann gar nichts geschickt wird, und dass
// weder Cookies noch Browserspeicher angefasst werden.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = path.join(dir, 'tests', '.count-worker-copy.mjs');
// .js ohne package.json gilt nicht als ES-Modul: über eine .mjs-Kopie laden
fs.writeFileSync(tmp, fs.readFileSync(path.join(dir, 'worker', 'count-worker.js'), 'utf8'));
const worker = (await import(pathToFileURL(tmp).href)).default;
fs.unlinkSync(tmp);

let n = 0;
const t = async (name, f) => { await f(); n++; console.log('ok  ' + name); };

// ---------- Attrappe: D1 auf echter SQLite-Datenbank ----------
function d1() {
  const db = new DatabaseSync(':memory:'), sql = [];
  const stmt = (q, args = []) => ({
    bind: (...a) => stmt(q, a),
    async first() { sql.push(q); return db.prepare(q).get(...args) || null; },
    async all() { sql.push(q); return { results: db.prepare(q).all(...args), success: true }; },
    async run() { sql.push(q); db.prepare(q).run(...args); return { results: [], success: true }; },
  });
  return {
    db, sql,
    async exec(q) { sql.push(q); db.exec(q); return { count: 1 }; },
    prepare: (q) => stmt(q),
  };
}

const PAGES = 'https://maximilian-stapper.github.io', W = 'https://count-worker.maximilian-stapper.workers.dev';
const ask = (env, p, o = {}) =>
  worker.fetch(new Request(W + p, { method: o.method || 'GET', headers: o.origin === null ? {} : { Origin: o.origin || PAGES } }), env);
const json = async (r) => ({ status: r.status, ...(await r.json()) });

// ---------- Teil 1: Worker ----------
await t('CORS: Vorabanfrage beantwortet, fremde oder fehlende Origin abgewiesen, nichts gezählt', async () => {
  const env = { DB: d1() };
  const pre = await ask(env, '/hit', { method: 'OPTIONS' });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), PAGES);
  assert.equal((await ask(env, '/hit', { method: 'POST', origin: 'https://evil.example' })).status, 403);
  assert.equal((await ask(env, '/hit', { method: 'POST', origin: null })).status, 403);
  assert.equal((await ask(env, '/count', { origin: 'http://localhost:8765' })).status, 403);
  assert.deepEqual(env.DB.sql, [], 'abgewiesene Anfragen fassen die Datenbank nicht an');
});

await t('/ping meldet, ob die Datenbank verbunden ist; ohne Bindung DB klare Fehlermeldung', async () => {
  assert.deepEqual(await json(await ask({ DB: d1() }, '/ping')), { status: 200, ok: true, db: true });
  assert.deepEqual(await json(await ask({}, '/ping')), { status: 200, ok: false, db: false });
  const r = await json(await ask({}, '/hit', { method: 'POST' }));
  assert.equal(r.status, 500);
  assert.equal(r.code, 'DB');
});

await t('Erster Aufruf legt die Tabelle an und zählt 1; /count liest nur', async () => {
  const env = { DB: d1() };
  assert.deepEqual(await json(await ask(env, '/count')), { status: 200, ok: true, total: 0 });
  assert.deepEqual(await json(await ask(env, '/hit', { method: 'POST' })), { status: 200, ok: true, total: 1 });
  assert.deepEqual(await json(await ask(env, '/hit', { method: 'POST' })), { status: 200, ok: true, total: 2 });
  assert.deepEqual(await json(await ask(env, '/count')), { status: 200, ok: true, total: 2 });
  assert.deepEqual(env.DB.db.prepare('SELECT name, n FROM counter').all().map((r) => ({ ...r })), [{ name: 'aufrufe', n: 2 }]);
});

await t('Falsche Methode oder Adresse zählt nicht (GET /hit, POST /count, /sonstwas)', async () => {
  const env = { DB: d1() };
  for (const [p, m] of [['/hit', 'GET'], ['/count', 'POST'], ['/', 'GET'], ['/hit/x', 'POST']]) assert.equal((await ask(env, p, { method: m })).status, 404, m + ' ' + p);
  assert.deepEqual(await json(await ask(env, '/count')), { status: 200, ok: true, total: 0 });
});

await t('100 gleichzeitige Aufrufe: keiner geht verloren', async () => {
  const env = { DB: d1() };
  const all = await Promise.all(Array.from({ length: 100 }, () => ask(env, '/hit', { method: 'POST' }).then(json)));
  assert.ok(all.every((r) => r.ok));
  assert.deepEqual(await json(await ask(env, '/count')), { status: 200, ok: true, total: 100 });
  assert.deepEqual(all.map((r) => r.total).sort((x, y) => x - y), Array.from({ length: 100 }, (_, i) => i + 1), 'jede Antwort eine andere Zahl');
});

await t('Gespeichert wird nur eine Zahl: eine Zeile, keine IP, kein Datum', async () => {
  const env = { DB: d1() };
  await worker.fetch(new Request(W + '/hit', { method: 'POST', headers: { Origin: PAGES, 'CF-Connecting-IP': '203.0.113.7', 'User-Agent': 'Test' } }), env);
  await ask(env, '/hit', { method: 'POST' });
  const cols = env.DB.db.prepare('PRAGMA table_info(counter)').all().map((c) => c.name);
  assert.deepEqual(cols, ['name', 'n']);
  assert.deepEqual(env.DB.db.prepare('SELECT * FROM counter').all().map((r) => ({ ...r })), [{ name: 'aufrufe', n: 2 }]);
  assert.deepEqual(env.DB.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name), ['counter']);
  const src = fs.readFileSync(path.join(dir, 'worker', 'count-worker.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(src, /CF-Connecting-IP|User-Agent|console\./i, 'Worker liest keine IP/User-Agent und loggt nichts');
});

await t('Datenbankfehler: 500 mit Meldung, beim nächsten Aufruf neuer Versuch', async () => {
  const good = d1();
  let broken = true;
  const env = { DB: { ...good, exec: (q) => (broken ? Promise.reject(new Error('down')) : good.exec(q)) } };
  const call = () => ask(env, '/hit', { method: 'POST' }).then(json);
  const r = await call();
  assert.equal(r.status, 500);
  assert.equal(r.code, 'ERR');
  assert.equal(r.message, 'Fehler im Zähler-Worker.');
  broken = false;
  assert.equal((await call()).total, 1);
});

await t('Tabelle wird nur einmal angelegt, danach keine CREATE-Abfrage mehr', async () => {
  const env = { DB: d1() };
  for (let i = 0; i < 3; i++) await ask(env, '/hit', { method: 'POST' });
  assert.equal(env.DB.sql.filter((q) => /CREATE TABLE/.test(q)).length, 1);
});

// ---------- Teil 2: counter.js in der App ----------
function app(o = {}) {
  const calls = [], els = [{ textContent: 'alt' }];
  const forbid = (what) => () => { throw new Error(what + ' darf nicht benutzt werden'); };
  const ctx = {
    location: { protocol: o.protocol || 'https:', hostname: o.host || 'maximilian-stapper.github.io', origin: o.origin || PAGES, pathname: '/abi-rechner_gaesdonck/' },
    performance: { getEntriesByType: () => (o.nav === null ? [] : [{ type: o.nav || 'navigate' }]) },
    document: { referrer: o.referrer || '', querySelectorAll: (s) => (s === '[data-cnt]' ? els : []) },
    fetch: async (url, init) => {
      calls.push({ url, method: (init && init.method) || 'GET', init });
      if (o.fail) throw new Error('offline');
      return { ok: true, json: async () => ({ ok: true, total: o.total ?? 1234 }) };
    },
    URL,
    console,
  };
  Object.defineProperty(ctx.document, 'cookie', { get: forbid('document.cookie'), set: forbid('document.cookie') });
  for (const k of ['localStorage', 'sessionStorage', 'indexedDB']) Object.defineProperty(ctx, k, { get: forbid(k) });
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(dir, 'counter.js'), 'utf8') + ';this.C=Counter', ctx);
  return { C: ctx.C, calls, els };
}

await t('Neu geöffnet: zählt einmal (POST /hit ohne Body und ohne Header), Zahl landet im Menü', async () => {
  const { C, calls, els } = app();
  await C.start();
  assert.deepEqual(calls.map((c) => [c.url, c.method]), [[W + '/hit', 'POST']]);
  assert.deepEqual(Object.keys(calls[0].init), ['method'], 'einfache Anfrage: kein Body, keine Header, keine Cookies');
  assert.equal(els[0].textContent, '1.234 Aufrufe');
  assert.equal(C.line(), '<small class=cnt data-cnt>1.234 Aufrufe</small>');
  assert.equal(calls.length, 1, 'Menü öffnen fragt nicht erneut, wenn die Zahl schon da ist');
});

await t('Neu laden, Zurück/Vor und Neuladen nach Update: nur lesen (GET /count)', async () => {
  for (const o of [{ nav: 'reload' }, { nav: 'back_forward' }, { referrer: PAGES + '/abi-rechner_gaesdonck/?v=20261125-1200' }]) {
    const { C, calls } = app(o);
    await C.start();
    assert.deepEqual(calls.map((c) => [c.url, c.method]), [[W + '/count', 'GET']], JSON.stringify(o));
  }
  // Link von einer anderen Seite oder ohne Navigationseintrag zählt normal
  for (const o of [{ referrer: 'https://www.google.com/' }, { referrer: PAGES + '/anderes-projekt/' }, { nav: null }]) {
    const { C, calls } = app(o);
    await C.start();
    assert.equal(calls[0].method, 'POST', JSON.stringify(o));
  }
});

await t('Außerhalb von GitHub Pages (lokale Vorschau, file:) passiert nichts, Menü ohne Zeile', async () => {
  for (const o of [{ protocol: 'http:', host: 'localhost', origin: 'http://localhost:8765' }, { protocol: 'file:', host: '', origin: 'null' }]) {
    const { C, calls } = app(o);
    await C.start();
    assert.equal(C.line(), '');
    assert.deepEqual(calls, []);
  }
});

await t('Worker nicht erreichbar: Zeile bleibt leer, beim Öffnen des Menüs neuer Leseversuch', async () => {
  const a = app({ fail: true });
  await a.C.start();
  assert.equal(a.els[0].textContent, '');
  assert.equal(a.C.line(), '<small class=cnt data-cnt></small>');
  assert.deepEqual(a.calls.map((c) => c.method), ['POST', 'GET']);
});

await t('Einzahl: „1 Aufruf“, große Zahlen mit Tausenderpunkt', async () => {
  const big = app({ total: 1234567 });
  await big.C.start();
  assert.equal(big.C._t.text(), '1.234.567 Aufrufe');
  const { C } = app({ total: 1 });
  await C.start();
  assert.equal(C._t.text(), '1 Aufruf');
});

await t('index.html: Skript eingebunden und Worker in der CSP erlaubt; Datenschutzhinweis nennt den Zähler', async () => {
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.match(html, /connect-src [^;]*https:\/\/count-worker\.maximilian-stapper\.workers\.dev/);
  assert.ok(html.indexOf('src="counter.js') > 0 && html.indexOf('src="counter.js') < html.indexOf('src="main.js'));
  assert.match(fs.readFileSync(path.join(dir, 'main.js'), 'utf8'), /Counter\.start\(\)/);
  const dlg = fs.readFileSync(path.join(dir, 'dialogs.js'), 'utf8');
  assert.match(dlg, /'Aufrufzähler'/);
  assert.match(dlg, /<div class=bar>\$\{Counter\.line\(\)\}<button class=bt data-a=cx>/, 'klein links neben „Schließen“');
});

console.log(`\n${n} Tests bestanden.`);
