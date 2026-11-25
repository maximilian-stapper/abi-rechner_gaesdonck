// count-worker.js – anonymer Aufrufzähler (Cloudflare Worker „count-worker“)
//
// Läuft unter https://count-worker.maximilian-stapper.workers.dev, getrennt von Untis- und Erinnerungs-Worker.
// Die App meldet sich beim Öffnen einmal (POST /hit, siehe counter.js), der Worker zählt in einer D1-Datenbank
// eine einzige Zahl um eins hoch und antwortet mit ihr. Die App zeigt sie klein im Menü.
//
// ROUTEN (nur von OK_ORIGINS)
//   GET  /ping    {ok, db}: erreichbar? Datenbank verbunden?
//   POST /hit     zählt einen Aufruf, Antwort {ok, total}
//   GET  /count   nur lesen, Antwort {ok, total}
//
// EINRICHTEN (Cloudflare-Dashboard, einmalig)
//   1. Speicher & Datenbanken → D1 → Datenbank erstellen (Name egal, z. B. „count-db“; Speicherort EU).
//      Eingerichtet am 2026-11-25: Datenbank „count-db“ mit Gerichtsstand EU, Worker-Logs (Observability) aus.
//   2. Workers & Pages → Erstellen → Worker „count-worker“ → diesen Code einfügen → Deploy.
//   3. Worker → Einstellungen → Bindungen → D1-Datenbank hinzufügen: Variablenname DB, Datenbank von oben.
//   Die Tabelle legt der Worker beim ersten Aufruf selbst an (fehlt sie, kommt „no such table“ und er legt sie an).
//   /ping zeigt, ob die Bindung fehlt.
//
// DATENSCHUTZ: Gespeichert wird nur eine einzige Zahl (Tabelle counter, Zeile „aufrufe“). Keine IP-Adresse,
// kein Gerät, kein Datum oder Uhrzeit, keine Cookies oder IDs. Der Worker liest weder IP noch User-Agent und loggt nichts.
// Was hier geändert wird, gehört auch in privacy() in dialogs.js („Aufrufzähler“).

const OK_ORIGINS = [
  'https://maximilian-stapper.github.io', // GitHub-Pages-Adresse
  // 'http://localhost:8765',             // nur zum lokalen Testen
];

// Tabelle erst anlegen, wenn sie fehlt (erster Aufruf nach dem Einrichten); sonst kostet das keine Abfrage
const TABLE = 'CREATE TABLE IF NOT EXISTS counter (name TEXT PRIMARY KEY, n INTEGER NOT NULL)';
async function withTable(db, f) {
  try {
    return await f();
  } catch (e) {
    if (!/no such table/i.test(String(e && e.message))) throw e;
    await db.exec(TABLE);
    return f();
  }
}

// Hochzählen und neuen Stand lesen in einer einzigen Anweisung: kein Aufruf geht verloren, auch gleichzeitig
const ADD = "INSERT INTO counter (name, n) VALUES ('aufrufe', 1) ON CONFLICT(name) DO UPDATE SET n = n + 1 RETURNING n";
const GET = "SELECT n FROM counter WHERE name = 'aufrufe'";
const out = (r) => ({ ok: true, total: Number((r && r.n) || 0) });

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
    const reply = (status, o) =>
      new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!OK_ORIGINS.includes(origin)) return new Response('forbidden', { status: 403, headers: cors });

    const path = new URL(req.url).pathname;
    if (path === '/ping') return reply(200, { ok: !!env.DB, db: !!env.DB });
    if (!env.DB) return reply(500, { ok: false, code: 'DB', message: 'Dem Worker fehlt die Datenbank (Bindung DB).' });
    const hit = path === '/hit' && req.method === 'POST',
      read = path === '/count' && req.method === 'GET';
    if (!hit && !read) return reply(404, { ok: false, code: 'ROUTE', message: 'Unbekannte Adresse.' });
    try {
      const db = env.DB;
      return reply(200, out(await withTable(db, () => db.prepare(hit ? ADD : GET).first())));
    } catch (e) {
      return reply(500, { ok: false, code: 'ERR', message: 'Fehler im Zähler-Worker.' });
    }
  },
};
