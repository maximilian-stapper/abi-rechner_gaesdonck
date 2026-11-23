// Prüft, ob der Klausurplan nur die eigenen schriftlichen Klausuren zeigt:
//   node tests/klausuren.test.js
const fs = require('fs'),
  vm = require('vm'),
  path = require('path'),
  assert = require('assert');
const ctx = {};
vm.createContext(ctx);
const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
vm.runInContext(src('klausurplan.js') + ';' + src('klausuren.js') + ';this.KP=KLAUSURPLAN;this.KL=Klausuren', ctx);
const { KP, KL } = ctx;

// Alle Klausuren einer Person als 'Datum Fach' (LK mit '-lk', unsicher mit '?')
const mine = (p) =>
  JSON.parse(JSON.stringify(KL.build(KP, p)))
    .flatMap((w) => w.days.flatMap((d) => d.exams))
    .map((e) => e.date + ' ' + e.k + (e.lk ? '-lk' : '') + (e.unsure ? '?' : '') + (e.dur ? '' : ' mdl'));
const cells = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [v, v, v, v]]));

// Einträge lesen
assert.deepStrictEqual(JSON.parse(JSON.stringify(KL.token('LK-T14-180 E:mdl'))), { band: 'T14', dur: 180, flags: [], per: { en: 'mdl' } });
assert.deepStrictEqual(JSON.parse(JSON.stringify(KL.token('S9-180 hsv'))), { k: 'e9', dur: 180, flags: ['hsv'] });
assert.strictEqual(KL.token('GoDi 8:45 Uhr').ev, 'GoDi 8:45 Uhr');

// Datenschutz: keine Nachschreibtermine im Plan (die Listen dazu enthalten Namen); kein Sternsingerimpuls
for (const [d, e] of Object.entries(KP.tage)) for (const v of Object.values(e)) assert.ok(!/\bNT\b|sternsinger/i.test(v), d + ': ' + v);

// Jeder Eintrag im Plan ist eine bekannte Klausur oder ein Termin (Tippfehler bei Fächern fallen hier auf)
for (const [d, e] of Object.entries(KP.tage)) {
  for (const [s, v] of Object.entries(e)) {
    assert.ok(['EF', 'Q1', 'Q2', 'alle'].includes(s), d + ': unbekannte Stufe ' + s);
    for (const t of v.split(',')) {
      const x = KL.token(t);
      if (x.ev) assert.ok(!/^[A-Z]{1,2}\d?-\d/.test(x.ev), d + ': Fach nicht erkannt: ' + t);
      if (x.band) assert.ok(KL.bands(KP, s)[x.band], d + ': unbekanntes Band ' + x.band);
    }
  }
}

// Q1: Deutsch schriftlich, Erdkunde mündlich → keine Erdkunde-Klausur; LK Geschichte (nur T14) und Bio (nur T15)
const q1 = mine({ stufe: 'Q1', idx: 0, cells: cells({ de: 'S', ek: 'M', ge: 'LK', bi: 'LK', s9: 'S' }), lks: ['ge', 'bi'], lkNr: {} });
assert.deepStrictEqual(q1, ['2026-10-06 ge-lk', '2026-10-08 de', '2026-11-03 bi-lk', '2026-12-08 ge-lk', '2026-12-15 bi-lk', '2026-12-21 de']);

// Q1: Mathe- und Englisch-LK liegen je nach Kurs in T14 oder T15. Ohne Kursnummer unklar …
const both = mine({ stufe: 'Q1', idx: 0, cells: cells({ ma: 'LK', en: 'LK' }), lks: ['ma', 'en'], lkNr: {} });
assert.ok(both.includes('2026-10-06 ma-lk?') && both.includes('2026-10-06 en-lk?'));
// … mit Kursnummer aus Untis klar: M L2 → T14, also Englisch in T15 (dort mündlich am 15.12.)
const sure = mine({ stufe: 'Q1', idx: 0, cells: cells({ ma: 'LK', en: 'LK' }), lks: ['ma', 'en'], lkNr: { ma: 2 } });
assert.deepStrictEqual(sure, ['2026-10-06 ma-lk', '2026-11-03 en-lk', '2026-12-08 ma-lk', '2026-12-15 en-lk mdl']);

// Spanisch ab EF (S0) und ab Kl. 9 (S9) sind verschiedene Fächer
const es = mine({ stufe: 'Q1', idx: 0, cells: cells({ e9: 'S' }), lks: [], lkNr: {} });
assert.deepStrictEqual(es, ['2026-09-28 e9', '2026-11-30 e9']);

// Q2 nutzt das Halbjahr Q2.1 (idx 2): in Q1 schriftlich, in Q2 mündlich → nichts
const q2 = mine({ stufe: 'Q2', idx: 2, cells: { sw: ['S', 'S', 'M', 'M'] }, lks: [], lkNr: {} });
assert.deepStrictEqual(q2, []);

// EF: Fächer aus Untis
const ef = mine({ stufe: 'EF', idx: 0, cells: {}, lks: [], lkNr: {}, subs: new Set(['ma']) });
assert.deepStrictEqual(ef, ['2026-11-11 ma', '2027-01-15 ma']);

// Ferien
const weeks = KL.build(KP, { stufe: 'Q1', idx: 0, cells: {}, lks: [] });
assert.strictEqual(weeks.find((w) => w.mon === '2026-10-19').days.every((d) => d.off === 'Herbstferien'), true);
assert.deepStrictEqual([...weeks.find((w) => w.mon === '2026-12-21').days.map((d) => d.off)], ['', '', 'Weihnachtsferien', 'Weihnachtsferien', 'Weihnachtsferien']);

// Kalenderdatei: ganztägig, eindeutige UID, Sonderzeichen maskiert, Zeilen höchstens 75 Zeichen
const ex = JSON.parse(JSON.stringify(KL.build(KP, { stufe: 'Q1', idx: 0, cells: cells({ ma: 'LK', en: 'LK' }), lks: ['ma', 'en'], lkNr: { ma: 2 } })))
  .flatMap((w) => w.days.flatMap((d) => d.exams))
  .filter((e) => e.date >= '2026-12-01');
const ics = KL.ics(ex, (e) => (e.k === 'ma' ? 'Mathematik LK' : 'Englisch LK'), new Date('2026-11-23T20:00:00Z'));
assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
assert.strictEqual((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
assert.ok(ics.includes('DTSTART;VALUE=DATE:20261208\r\nDTEND;VALUE=DATE:20261209'));
assert.ok(ics.includes('SUMMARY:Klausur Mathematik LK (180 Min.)'));
assert.ok(ics.includes('SUMMARY:Mündliche Prüfung Englisch LK'));
assert.ok(ics.includes('UID:20261215-en-lk@abi-rechner-gaesdonck'));
assert.ok(ics.includes('DTSTAMP:20261123T200000Z'));
assert.ok(ics.split('\r\n').every((l) => l.length <= 75));
assert.ok(KL.ics([{ date: '2026-12-01', k: 'de', lk: false, dur: 90, flags: [] }], () => 'A, B; C', new Date()).includes('Klausur A\\, B\\; C'));

console.log('klausuren: alle Prüfungen bestanden');
