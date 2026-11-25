/* =============================================================================
 * counter.js – anonymer Aufrufzähler. Modul Counter
 *
 * Weg: App → Zähler-Worker (worker/count-worker.js, eigener Cloudflare-Worker mit D1-Datenbank).
 * start() (aus main.js) meldet beim Öffnen einen Aufruf (POST /hit) und merkt sich die Antwort nur im
 * Arbeitsspeicher. menu() zeigt sie ganz klein mit line(); kommt sie erst später an, trägt fill() sie nach.
 *
 * Kein Cookie, nichts im Browserspeicher, keine ID: gezählt werden Aufrufe, keine Personen.
 * Nicht mitgezählt (dann wird nur gelesen, GET /count): Neu laden, Zurück/Vor und das automatische Neuladen
 * nach einem Update (kommt von genau dieser Seite). Außerhalb von GitHub Pages (lokale Vorschau) passiert nichts.
 * ========================================================================== */
const Counter = (() => {
  'use strict';
  const WORKER = 'https://count-worker.maximilian-stapper.workers.dev',
    HOME = 'maximilian-stapper.github.io';
  let data = null, // { total }
    busy = false;

  const live = () => location.protocol === 'https:' && location.hostname === HOME;

  // Neu geöffnet (zählen) oder nur neu geladen (nicht zählen)?
  function fresh() {
    try {
      const nav = performance.getEntriesByType('navigation')[0];
      if (nav && nav.type !== 'navigate') return false;
    } catch (e) {}
    try {
      const r = document.referrer ? new URL(document.referrer) : null;
      if (r && r.origin === location.origin && r.pathname === location.pathname) return false; // Update-Neuladen
    } catch (e) {}
    return true;
  }

  // Ohne Body und ohne eigene Header: einfache Anfrage, kein CORS-Vorabaufruf
  function ask(hit) {
    if (busy) return Promise.resolve(data);
    busy = true;
    return fetch(WORKER + (hit ? '/hit' : '/count'), hit ? { method: 'POST' } : {})
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && j.ok && Number.isFinite(j.total)) data = { total: j.total };
      })
      .catch(() => {})
      .then(() => {
        busy = false;
        fill();
        return data;
      });
  }

  const num = (n) => Number(n).toLocaleString('de-DE');
  const text = () => (data ? `${num(data.total)} ${data.total === 1 ? 'Aufruf' : 'Aufrufe'}` : '');

  function start() {
    if (live()) return ask(fresh());
  }
  // Zeile fürs Menü (leer, solange keine Zahl da ist; fehlt sie noch, wird sie nachgeladen)
  function line() {
    if (!live()) return '';
    if (!data) ask(false);
    return `<small class=cnt data-cnt>${text()}</small>`;
  }
  function fill() {
    document.querySelectorAll('[data-cnt]').forEach((el) => (el.textContent = text()));
  }

  return { start, line, fill, _t: { fresh, text, live } };
})();
