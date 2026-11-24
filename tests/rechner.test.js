// Prüft den Rechenkern (calculation.js) für beide Prüfungsordnungen:
//   node tests/rechner.test.js
// - Beispiellaufbahn mit 40 Kursen, von Hand nachgerechnet: Abitur 2028 (bisherige APO-GOSt) und 2030 (APO-GOSt (2027))
// - Sonderfälle ab 2030: Referenzfach als 5. Abiturfach, Besondere Lernleistung, genau 7 bzw. 8 Defizite, 3 bzw. 4 LK-
//   Defizite, Block I genau 200, Block-II-Bedingungen (vierfach, 3 Fächer mit 20 Punkten), Projektkurs mit 0 Punkten,
//   40 belegte Kurse mit Vertiefungskursen, Wiederholer (Q1 vor 2028/29) nach alten Regeln, Notengrenzen
// - Vergleich mit einer vollständigen Suche: Für zufällige Laufbahnen ab 2030 werden ALLE Auswahlen von 36 Kursen
//   gegen § 26/§ 27 APO-GOSt (2027) geprüft; der Rechner muss dieselbe Zulässigkeit und dieselbe beste Punktzahl finden.
const fs = require('fs'),
  vm = require('vm'),
  path = require('path'),
  assert = require('assert');
const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const ctx = {
  console,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  navigator: {},
  alert() {},
  document: { querySelector: () => null },
};
vm.createContext(ctx);
vm.runInContext(src('constants.js') + ';' + src('state.js') + ';' + src('calculation.js'), ctx);
// Ergebnis als JSON aus dem vm-Kontext holen (sonst haben Arrays einen fremden Prototyp)
const run = (s) => {
  ctx.__s = JSON.stringify(s);
  return JSON.parse(
    vm.runInContext(
      `st = migrate(JSON.parse(__s));
      (() => {
        const r = solve(), T = tot(r);
        return JSON.stringify({ P: r.P, N: r.N, cnt: r.cnt, d: r.d, ld: r.ld, b1: r.b1, ok: r.ok, feas: r.feas, viol: r.viol,
          nbel: r.nbel, belegtOk: r.belegtOk, cntOk: r.cntOk, defOk: r.defOk, must: [...r.must].sort(), keys: [...r.keys].sort(),
          items: r.items.map((c) => ({ k: c.k, p: c.p })), v: T.v, b2: T.b2, G: T.G, nx: T.nx, pass: T.pass, note: grade(T.G) });
      })()`,
      ctx,
    ),
  );
};
const cp = (o) => JSON.parse(JSON.stringify(o));

// ---------------------------------------------------------------------------
// Beispiellaufbahn: LK Englisch und Biologie, 40 Kurse in der Q-Phase (mit Projektkurs, Referenzfach Erdkunde)
// ---------------------------------------------------------------------------
const g = {},
  put = (id, a) => a.forEach((p, i) => p != null && (g[id + '.' + i] = { f: p }));
put('en', [10, 10, 10, 10]);
put('bi', [12, 12, 12, 12]);
put('de', [9, 9, 9, 9]);
put('ma', [11, 11, 11, 11]);
put('sw', [8, 8, 8, 8]);
put('ge', [null, null, 7, 7]);
put('re', [15, 15, 3, 3]);
put('sp', [12, 12, 12, 12]);
put('ku', [14, 14]);
put('ph', [6, 6, 6, 6]);
put('ek', [5, 5]);
put('pk', [null, null, 13, 13]);
const L = { LK: ['LK', 'LK', 'LK', 'LK'], S: ['S', 'S', 'S', 'S'], M: ['M', 'M', 'M', 'M'] };
const base = {
  v: 1,
  y: 2030,
  cells: { en: L.LK, bi: L.LK, de: L.S, ma: L.S, sw: L.S, ge: ['', '', 'ZK', 'ZK'], re: L.M, sp: L.M, ku: ['M', 'M', '', ''], ph: ['S', 'S', 'S', 'M'], ek: ['S', 'S', '', ''] },
  af: { en: 1, bi: 2, de: 3, sw: 4, ma: 5 },
  sp: {},
  g,
  pf: {},
  pj: { ref: 'ek' },
  vk: 0,
  x: { 1: { s: 11 }, 2: { s: 10, m: 13 }, 3: { s: 7 }, 4: { s: 9 }, 5: { s: 12 } },
};

// Abitur 2030: Pflicht sind 30 Kurse (LK 8, Deutsch, Mathe, SoWi je 4, Projektkurs 2, Geschichte-ZK 2, Religion 2,
// Kunst 2, Physik als Schwerpunktfach Q2 2). Dazu die 6 besten wählbaren: Sport 4 × 12, Physik Q1 6 + 6.
// P = 2 × (40 + 48) + 222 + 60 = 458, S = 44 → 458 ÷ 44 × 40 = 416,36 → 416.
// Block II: 4 × 11 = 44; (2 × 10 + 13) ÷ 3 × 4 = 44; 4 × 7 = 28; 4 × 9 = 36; 4 × 12 = 48 → 200. 616 → 2,2.
let r = run(base);
assert.deepStrictEqual([r.P, r.N, r.cnt, r.b1, r.d, r.ld, r.must.length], [458, 44, 36, 416, 0, 0, 30]);
assert.deepStrictEqual([r.v, r.b2, r.G, r.note, r.ok, r.pass, r.nbel], [[44, 44, 28, 36, 48], 200, 616, '2,2', true, true, 40]);
assert.ok(r.keys.includes('pk.2') && r.keys.includes('pk.3') && !r.keys.includes('ek.0') && !r.keys.includes('re.2'));

// Dieselbe Laufbahn für Abitur 2028 (ohne Projektkurs, 4 Prüfungen): 28 Pflichtkurse, dann 7 wählbare (35 Kurse) ist
// der beste Schnitt: 437 ÷ 43 × 40 = 406,5 → 407. Block II: 55 + 55 + 35 + 45 = 190. 597 → 2,3.
const a28 = cp(base);
a28.y = 2028;
delete a28.pj;
delete a28.x[5];
r = run(a28);
assert.deepStrictEqual([r.P, r.N, r.cnt, r.b1, r.must.length, r.v, r.b2, r.G, r.note, r.ok], [437, 43, 35, 407, 28, [55, 55, 35, 45], 190, 597, '2,3', true]);
// Ohne Jahrgang (Stände von vor der Abfrage) und als Wiederholer mit Q1 schon 2027/28 gilt dasselbe
const noY = cp(a28);
delete noY.y;
assert.deepStrictEqual(run(noY), r);
const wdh = cp(base);
wdh.q1alt = true;
assert.deepStrictEqual([run(wdh).b1, run(wdh).b2, run(wdh).G], [407, 190, 597]);

// 5. Abiturfach = Referenzfach des Projektkurses (§ 26 Abs. 2 Satz 2): nur Erdkunde Q1.1/Q1.2 zählen, Mathe bleibt
// über die Mathe-Pflicht ganz drin. 222 + 10 + 4 × 12 = 280, P = 456 → 414,5 → 415.
const ref = cp(base);
ref.af = { en: 1, bi: 2, de: 3, sw: 4, ek: 5 };
r = run(ref);
assert.deepStrictEqual([r.P, r.b1, r.G, r.must.includes('ek.0'), r.must.includes('ek.1'), r.must.includes('ph.0')], [456, 415, 615, true, true, false]);

// Besondere Lernleistung im 5. Fach (Chemie, ohne Kurs belegt): keine 4-Kurs-Pflicht; BLL 14 Punkte → 56.
// 616 − 48 + 56 = 624 ist genau die Grenze zur 2,2 (624–607), 625 wäre 2,1.
const bll = cp(base);
bll.af = { en: 1, bi: 2, de: 3, sw: 4, ch: 5 };
bll.bll = true;
bll.x[5] = { s: 14 };
r = run(bll);
assert.deepStrictEqual([r.b1, r.v[4], r.b2, r.G, r.note, r.ok], [416, 56, 208, 624, '2,2', true]);
ctx.__g = JSON.parse(vm.runInContext('JSON.stringify([grade(625), grade(823), grade(822), grade(301), grade(300), grade(299)])', ctx));
assert.deepStrictEqual(ctx.__g, ['2,1', '1,0', '1,1', '3,9', '4,0', 'nicht bestanden']);

// Advanced Class statt Projektkurs (Gaesdonck): gerechnet wird genau gleich, nur der Name ändert sich
const ac = cp(base);
ac.pj = { ref: 'ek', type: 'ac' };
r = run(ac);
assert.deepStrictEqual([r.P, r.b1, r.G, r.must.includes('pk.2')], [458, 416, 616, true]);
ac.g['pk.2'] = { f: 0 };
assert.ok(run(ac).viol.includes('Advanced Class Q2.1: 0 Punkte, gilt als nicht belegt'));

// Defizite ab 2030: höchstens 7 unter den 36 (§ 27 Abs. 2 Nr. 1)
const d7 = cp(base);
['de.0', 'de.1', 'de.2', 'de.3', 'sw.0', 'sw.1', 'sw.2'].forEach((k) => (d7.g[k] = { f: 4 }));
r = run(d7);
assert.deepStrictEqual([r.d, r.defOk, r.ok], [7, true, true]);
d7.g['sw.3'] = { f: 4 };
r = run(d7);
assert.deepStrictEqual([r.d, r.defOk, r.ok], [8, false, false]);
// ... davon höchstens 3 Leistungskurse
const lk = cp(base);
['en.0', 'en.1', 'en.2'].forEach((k) => (lk.g[k] = { f: 3 }));
r = run(lk);
assert.deepStrictEqual([r.ld, r.defOk], [3, true]);
lk.g['en.3'] = { f: 4 };
r = run(lk);
assert.deepStrictEqual([r.ld, r.defOk, r.ok], [4, false, false]);

// Block I genau 200: alle Kurse 5 Punkte → 220 ÷ 44 × 40 = 200; ein Pflichtkurs mit 4 → 219 ÷ 44 × 40 = 199,1 → 199
const b200 = cp(base);
for (const k in b200.g) b200.g[k] = { f: 5 };
r = run(b200);
assert.deepStrictEqual([r.P, r.b1], [220, 200]);
b200.g['de.0'] = { f: 4 };
r = run(b200);
assert.deepStrictEqual([r.P, r.b1, r.ok], [219, 199, true]); // zugelassen (200 ist Bedingung für das Bestehen) …
assert.strictEqual(r.pass, false); // … aber nicht bestanden

// Block II ab 2030 (§ 38 Abs. 3): in drei Prüfungsfächern mind. 20, darunter ein LK; Block II mind. 100
const ex = (xs) => {
  const s = cp(base);
  s.x = Object.fromEntries(xs.map((x, i) => [i + 1, x]));
  return run(s);
};
r = ex([{ s: 4 }, { s: 4 }, { s: 15 }, { s: 15 }, { s: 15 }]); // drei Fächer, aber kein LK
assert.deepStrictEqual([r.b2, r.nx, r.pass], [16 + 16 + 180, false, false]);
r = ex([{ s: 5 }, { s: 4 }, { s: 5 }, { s: 4 }, { s: 5 }]); // drei Fächer mit LK, aber Block II nur 92
assert.deepStrictEqual([r.b2, r.nx, r.pass], [92, true, false]);
r = ex([{ s: 4, m: 7 }, { s: 4 }, { s: 15 }, { s: 15 }, { s: 3 }]); // (8 + 7) ÷ 3 × 4 = 20 im LK
assert.deepStrictEqual([r.v, r.nx, r.pass], [[20, 16, 60, 60, 12], true, true]);
r = ex([{ s: 5, m: 6 }, { s: 4, m: 6 }, { s: 1, m: 15 }, { s: 0 }, { s: 15 }]); // 21,3 → 21; 18,7 → 19; 22,7 → 23
assert.deepStrictEqual(r.v, [21, 19, 23, 0, 60]);

// Projektkurs mit 0 Punkten: gilt als nicht belegt (§ 26 Abs. 1): Pflicht verletzt und nur noch 39 Kurse belegt
const pk0 = cp(base);
pk0.g['pk.3'] = { f: 0 };
r = run(pk0);
assert.ok(r.viol.includes('Projektkurs Q2.2: 0 Punkte, gilt als nicht belegt'));
assert.deepStrictEqual([r.nbel, r.belegtOk, r.ok], [39, false, false]);
// Ein wählbarer Kurs mit 0 Punkten: Block I geht, aber nur 39 belegt; ein Vertiefungskurs gleicht das aus
const z = cp(base);
z.g['ek.1'] = { f: 0 };
r = run(z);
assert.deepStrictEqual([r.viol.length, r.feas, r.nbel, r.belegtOk, r.ok], [0, true, 39, false, false]);
z.vk = 1;
r = run(z);
assert.deepStrictEqual([r.nbel, r.belegtOk, r.ok], [40, true, true]);

// Mehr Pflichtkurse als einbringbar (hier: Geschichte versehentlich viermal als Zusatzkurs): 38 Pflichtkurse,
// genau 36 sind nicht möglich → Kurszahl nicht zulässig, keine Zulassung (angezeigt wird wie bisher die Auswahl mit
// dem besten Schnitt)
const many = cp(base);
many.cells.ek = L.S;
many.cells.ch = L.S;
many.cells.ge = ['ZK', 'ZK', 'ZK', 'ZK'];
many.cells.sw = ['', '', 'ZK', 'ZK'];
['ek', 'ch', 'ge'].forEach((id) => [0, 1, 2, 3].forEach((i) => (many.g[id + '.' + i] = { f: 9 })));
many.af = { en: 1, bi: 2, de: 3, ek: 4, ch: 5 };
many.pf = { sf: 'ph' };
r = run(many);
assert.deepStrictEqual([r.must.length, r.cnt >= 38, r.cntOk, r.ok], [38, true, false, false]);

// Festgelegtes Schwerpunktfach (bis 2029 wie ab 2030): Es ist eine *weitere* Fremdsprache, kann also nicht zugleich
// die durchgehende Fremdsprache sein. Englisch als Schwerpunktfach → Französisch muss die Fremdsprache sein.
const sfx = cp(a28);
sfx.cells.fr = ['S', 'S', 'S', 'M'];
[0, 1, 2, 3].forEach((i) => (sfx.g['fr.' + i] = { f: 13 }));
sfx.cells.en = L.S;
sfx.cells.ma = L.LK;
sfx.af = { ma: 1, bi: 2, de: 3, sw: 4 };
sfx.pf = { sf: 'en' };
r = run(sfx);
assert.ok(r.ok && ['fr.0', 'fr.1', 'fr.2', 'fr.3', 'en.2', 'en.3'].every((k) => r.must.includes(k)), r.viol.join('; '));
// Ohne Französisch gibt es keine andere Fremdsprache: Pflichtbelegung verletzt (früher zählte Englisch doppelt)
sfx.cells.fr = ['', '', '', ''];
r = run(sfx);
assert.ok(r.viol.includes('Kein durchgehend belegtes Fach: Fremdsprache') && !r.ok, r.viol.join('; '));

// Literatur: höchstens 2 Kurse (§ 26 Abs. 7)
const li = cp(base);
li.cells.ku = ['', '', '', ''];
li.cells.li = ['M', 'M', 'M', 'M'];
[0, 1, 2, 3].forEach((i) => (li.g['li.' + i] = { f: 15 }));
r = run(li);
assert.strictEqual(r.keys.filter((k) => k.startsWith('li.')).length, 2);

// ---------------------------------------------------------------------------
// Vollständige Suche (ab 2030) gegen den Rechner
// ---------------------------------------------------------------------------
let seed = 20300;
const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  },
  pick = (a) => a[Math.floor(rnd() * a.length)],
  FS = ['en', 'fr', 'la', 'es', 'e9'],
  NW = ['ph', 'ch', 'bi'],
  GW = ['ek', 'ge', 'sw'],
  SF = [...FS, 'bi', 'ch', 'ph', 'if'];
function laufbahn() {
  const cells = { pk: ['', '', 'PK', 'PK'] },
    set = (id, a) => (cells[id] = a.slice()),
    lks = pick([['en', 'bi'], ['de', 'ma'], ['ma', 'ph'], ['en', 'ge'], ['de', 'bi'], ['fr', 'ma'], ['ku', 'en'], ['sw', 'ma'], ['la', 'ch'], ['de', 'ek']]);
  lks.forEach((id) => set(id, L.LK));
  for (const id of ['de', 'ma']) cells[id] || set(id, L.S);
  const fs1 = pick(['en', 'fr', 'la', 'e9']),
    nw = pick(NW),
    gw = pick(GW);
  cells[fs1] || set(fs1, ['S', 'S', 'S', pick(['S', 'M'])]);
  cells[nw] || set(nw, ['S', 'S', pick(['S', 'M']), 'M']);
  cells[gw] || set(gw, ['S', 'S', 'S', pick(['S', 'M'])]);
  for (const z of ['ge', 'sw']) cells[z] || set(z, rnd() < 0.8 ? ['', '', 'ZK', 'ZK'] : ['M', 'M', '', '']);
  set('re', rnd() < 0.6 ? L.M : ['M', 'M', '', '']);
  set('sp', L.M);
  const art = pick(['ku', 'mu', 'li']);
  cells[art] || set(art, art == 'li' ? (rnd() < 0.3 ? ['M', 'M', 'M', ''] : ['M', 'M', '', '']) : rnd() < 0.5 ? ['M', 'M', '', ''] : ['', 'M', 'M', 'M']);
  const sf = pick(['fr', 'la', 'es', 'ch', 'ph', 'if', 'bi', 'en'].filter((x) => x != fs1 && x != nw));
  cells[sf] || set(sf, ['S', 'S', pick(['S', 'M']), 'M']);
  if (rnd() < 0.35) {
    const x = pick(['ch', 'ph', 'if', 'mu', 'li', 'ek', 'la']);
    cells[x] || set(x, [pick(['', 'M', 'S']), pick(['', 'M', 'S']), pick(['', 'M']), pick(['', 'M'])]);
  }
  const af = { [lks[0]]: 1, [lks[1]]: 2 },
    s3 = (id) => cells[id][0] == 'S' && cells[id][1] == 'S' && cells[id][2] == 'S',
    free = (f) => Object.keys(cells).filter((id) => id != 'pk' && !af[id] && f(id));
  const a3 = pick(free(s3));
  if (a3) af[a3] = 3;
  const a4 = pick(free((id) => cells[id].every(Boolean) && id != 'sp'));
  if (a4) af[a4] = 4;
  const ref = rnd() < 0.85 ? pick(free((id) => ['S', 'LK'].includes(cells[id][0]) && ['S', 'LK'].includes(cells[id][1]))) : undefined;
  let bll = false;
  const m = rnd();
  if (m < 0.45 && ref && !af[ref]) af[ref] = 5;
  else if (m < 0.65) {
    bll = true;
    const b = pick(['ch', 'ph', 'if', 'mu', 'ku', 'ge', 'ek', 'la', 'sw', 'li'].filter((x) => !af[x]));
    if (b) af[b] = 5;
  } else {
    const a5 = pick(free(s3));
    if (a5) af[a5] = 5;
  }
  const bad = rnd() < 0.35 ? 4 : 1,
    p = () => {
      const x = rnd();
      return x < 0.004 * bad ? 0 : x < 0.12 * bad ? 1 + Math.floor(rnd() * 4) : 5 + Math.floor(rnd() * 11);
    },
    gg = {};
  for (const id in cells) cells[id].forEach((t, i) => t && rnd() > 0.1 && (gg[id + '.' + i] = { f: p() }));
  const s = { v: 1, y: 2030, cells, af, sp: {}, g: gg, x: {}, pf: {}, pj: ref ? { ref } : {}, bll, vk: 0 };
  if (rnd() < 0.15) s.pf.nw = pick(NW);
  if (rnd() < 0.15) s.pf.sf = pick(SF);
  if (rnd() < 0.1) s.pf.fs = pick(FS);
  if (rnd() < 0.12) {
    s.nz2 = true;
    cells.es = ['S', 'S', 'S', 'M'];
    [0, 1, 2, 3].forEach((i) => (gg['es.' + i] = { f: p() }));
  }
  return s;
}
// Prüft eine Laufbahn direkt nach § 26/§ 27 APO-GOSt (2027), indem es alle Auswahlen von 28 weiteren Kursen probiert.
function search(s, items) {
  const P = Object.fromEntries(items.map((c) => [c.k, c.p])),
    ce = (id) => s.cells[id] || [],
    ok = (k) => P[k] > 0,
    four = (id) => [0, 1, 2, 3].every((i) => ce(id)[i] && ok(id + '.' + i)),
    keys = (id) => [0, 1, 2, 3].filter((i) => ce(id)[i]).map((i) => id + '.' + i),
    isLK = (k) => ce(k.split('.')[0])[+k.split('.')[1]] == 'LK',
    all = items.filter((c) => c.p > 0).map((c) => c.k),
    LK = all.filter(isLK),
    rest = all.filter((k) => !isLK(k)),
    abi = (n) => Object.keys(s.af).find((id) => s.af[id] == n),
    fixed = new Set(LK),
    no = { feas: false };
  if (keys('sp').some((k) => !ok(k)) || LK.length != 8) return no;
  for (const id in s.cells) if (ce(id).some((t, i) => t == 'ZK' && !ok(id + '.' + i))) return no;
  for (const id of [abi(1), abi(2), abi(3), abi(4), 'de', 'ma']) {
    if (!id || !four(id)) return no;
    keys(id).forEach((k) => fixed.add(k));
  }
  const a5 = abi(5);
  if (a5 && !s.bll) {
    const q1 = a5 == s.pj.ref ? [0, 1] : [0, 1, 2, 3];
    if (!q1.every((i) => ce(a5)[i] && ok(a5 + '.' + i))) return no;
    q1.forEach((i) => fixed.add(a5 + '.' + i));
  }
  if (!ok('pk.2') || !ok('pk.3')) return no;
  fixed.add('pk.2').add('pk.3');
  for (const id in s.cells) ce(id).forEach((t, i) => t == 'ZK' && fixed.add(id + '.' + i));
  const has = (id) => ce(id).some(Boolean),
    only = (key, list) => (s.pf[key] && has(s.pf[key]) ? [s.pf[key]] : list),
    req = [];
  for (const f of only('fs', FS).filter(four))
    for (const n of only('nw', NW).filter(four))
      for (const gw of only('gw', GW).filter(four)) {
        const sl = s.pf.sf && has(s.pf.sf) ? [s.pf.sf] : s.nz2 && f != 'es' && has('es') ? ['es'] : SF;
        for (const x of sl) {
          if (x == f || x == n || !four(x)) continue;
          const R = new Set(fixed);
          [f, n, gw].forEach((id) => keys(id).forEach((k) => R.add(k)));
          req.push(R.add(x + '.2').add(x + '.3'));
        }
      }
  const drop = rest.length - 28;
  if (!req.length || drop < 0) return no;
  if (drop > 4) return { skip: true };
  const pLK = LK.reduce((x, k) => x + 2 * P[k], 0),
    dLK = LK.filter((k) => P[k] <= 4).length,
    idx = [];
  let best = null;
  const test = (X) => {
    const inX = (k) => isLK(k) || X.has(k),
      cnt = (id) => keys(id).filter((k) => X.has(k)).length;
    if (!req.some((R) => [...R].every(inX))) return;
    if ((cnt('ge') < 2 && !keys('ge').some(isLK)) || (cnt('sw') < 2 && !keys('sw').some(isLK)) || cnt('re') < 2 || cnt('li') > 2) return;
    if (!['ku', 'mu'].some((id) => [0, 1, 2].some((i) => inX(id + '.' + i) && inX(id + '.' + (i + 1)))) && cnt('li') < 2) return;
    let d = dLK,
      p = pLK;
    for (const k of X) (p += P[k]), (d += P[k] <= 4);
    if (dLK <= 3 && d <= 7 && (!best || p > best)) best = p;
  };
  const rec = (k, from) => {
    if (k == drop) return test(new Set(rest.filter((_, i) => !idx.slice(0, drop).includes(i))));
    for (let i = from; i < rest.length; i++) (idx[k] = i), rec(k + 1, i + 1);
  };
  rec(0, 0);
  return best == null ? no : { feas: true, P: best };
}
let checked = 0,
  feasible = 0;
for (let t = 0; t < 600 && checked < 60; t++) {
  const s = laufbahn(),
    a = run(s),
    o = search(s, a.items);
  if (o.skip) continue;
  checked++;
  if (o.feas) feasible++;
  const appOk = a.feas && !a.viol.length;
  assert.strictEqual(appOk, o.feas, 'Zulässigkeit weicht ab: ' + JSON.stringify(s));
  if (o.feas) assert.deepStrictEqual([a.P, a.N, a.cnt], [o.P, 44, 36], 'Punktzahl weicht ab: ' + JSON.stringify(s));
}
assert.ok(checked >= 40 && feasible >= 15, checked + ' geprüft, ' + feasible + ' zulässig');

console.log('rechner: alle Prüfungen bestanden (' + checked + ' Laufbahnen vollständig durchsucht, ' + feasible + ' davon zulässig)');
