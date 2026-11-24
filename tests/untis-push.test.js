// Prüft, was die App an den Erinnerungs-Worker schickt (untis-push.js, list) und wann sie Mitteilungen anbietet:
//   node tests/untis-push.test.js
// Der Ablauf im Browser (Einschalten, Test, Ausschalten, neue Worker-Schlüssel) ist mit nachgestelltem
// Push-Dienst in der Vorschau geprüft; echte Mitteilungen zeigt erst die App vom Home-Bildschirm.
const fs = require('fs'),
  vm = require('vm'),
  path = require('path'),
  assert = require('assert');

const load = (o = {}) => {
  const ctx = {
    K: 'abirechner',
    Untis: { on() {}, homework: () => [], util: { today: () => '2026-11-24', add: (s) => s } },
    UntisSubjects: { name: (k) => ({ ma: 'Mathematik', 'de-lk': 'Deutsch LK' })[k] || k },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { protocol: o.protocol || 'https:', hash: '', pathname: '/', search: '' },
    navigator: Object.assign({ userAgent: o.ua || 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 }, o.nav || {}),
    matchMedia: () => ({ matches: !!o.standalone }),
    addEventListener() {},
    document: { getElementById: () => null, querySelector: () => null },
    history: { replaceState() {} },
    esc: (s) => String(s),
    console,
  };
  ctx.window = ctx;
  if (o.push !== false) Object.assign(ctx, { PushManager: function () {}, Notification: { permission: o.perm || 'default' } });
  if (o.push !== false) ctx.navigator.serviceWorker = { addEventListener() {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'untis-push.js'), 'utf8') + ';this.P=UntisPush', ctx);
  return ctx.P;
};

const P = load();
const hw = [
  { id: 1, sub: 'ma', subName: 'M G1', text: '  S. 34\n Nr. 5 ', due: '2026-11-26', done: false },
  { id: 2, sub: 'de-lk', subName: 'D L1', text: 'Gedicht', due: '2026-11-25', done: false },
  { id: 3, sub: '', subName: 'XY Z9', text: 'unbekanntes Fach', due: '2026-11-25', done: false },
  { id: 4, sub: 'ma', text: 'erledigt', due: '2026-11-25', done: true },
  { id: 5, sub: 'ma', text: 'überfällig', due: '2026-11-23', done: false },
  { id: 6, sub: 'ma', text: 'ohne Fälligkeit', due: '', done: false },
  { id: 7, sub: 'ma', text: 'heute', due: '2026-11-24', done: false },
  { id: 8, sub: '', subName: '', text: 'x'.repeat(400), due: '2026-12-01', done: false },
];
const out = JSON.parse(JSON.stringify(P.list(hw, '2026-11-24')));
assert.deepStrictEqual(out.map((h) => h.d), ['2026-11-24', '2026-11-25', '2026-11-25', '2026-11-26', '2026-12-01']);
assert.deepStrictEqual(out.map((h) => h.s), ['Mathematik', 'Deutsch LK', 'XY Z9', 'Mathematik', 'Hausaufgabe']);
assert.strictEqual(out[3].t, 'S. 34 Nr. 5');
assert.strictEqual(out[4].t.length, 160);
assert.deepStrictEqual(Object.keys(out[0]).sort(), ['d', 's', 't']); // keine IDs, Lehrer oder Bemerkungen
assert.strictEqual(P.list(Array.from({ length: 80 }, (_, i) => ({ sub: 'ma', text: '', due: '2026-11-25', done: false })), '2026-11-24').length, 60);
console.log('ok  Übertragen werden nur offene, nicht überfällige Hausaufgaben mit Fälligkeit: Datum, Fach, Text');

assert.strictEqual(load().where(), 'ok');
assert.strictEqual(load({ perm: 'denied' }).where(), 'denied');
assert.strictEqual(load({ push: false }).where(), 'none');
assert.strictEqual(load({ protocol: 'file:' }).where(), 'file');
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)';
assert.strictEqual(load({ ua: IPHONE, push: false }).where(), 'home'); // Safari-Tab: erst zum Home-Bildschirm
assert.strictEqual(load({ ua: IPHONE, standalone: true }).where(), 'ok');
assert.strictEqual(load({ nav: { maxTouchPoints: 5 }, push: false }).where(), 'home'); // iPad gibt sich als Mac aus
assert.match(load({ ua: IPHONE, push: false }).card(), /Zum Home-Bildschirm/);
assert.match(load().card(), /data-u=nton/);
assert.doesNotMatch(load().card(), /data-u=ntoff/);
console.log('ok  Mitteilungen werden nur angeboten, wo sie gehen (iPhone nur als App vom Home-Bildschirm)');
