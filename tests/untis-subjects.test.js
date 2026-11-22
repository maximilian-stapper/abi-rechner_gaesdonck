// Prüft die Fach-Erkennung gegen alle Kurse aus der Q1-Liste (Kürzel, Name, erwartete Gruppe):
//   node tests/untis-subjects.test.js
const fs = require('fs'),
  vm = require('vm'),
  path = require('path'),
  assert = require('assert');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'untis-subjects.js'), 'utf8') + ';this.US=UntisSubjects', ctx);
const US = ctx.US;

// [Untis-Kürzel, angezeigte Bezeichnung, erwartete Gruppe]   ('-lk' = Leistungskurs, 'pk-…' = Projektkurs)
const rows = [
  ['D G1', 'Deutsch GK1', 'de'], ['D G2', 'Deutsch GK2', 'de'], ['D G3', 'Deutsch GK3', 'de'], ['D L2', 'Deutsch LK2', 'de-lk'],
  ['M G1', 'Mathematik GK1', 'ma'], ['M G2', 'Mathematik GK2', 'ma'], ['M G3', 'Mathematik GK3', 'ma'], ['M L2', 'Mathematik LK2', 'ma-lk'],
  ['E5 G1', 'Englisch GK1', 'en'], ['E5 G2', 'Englisch GK2', 'en'], ['E5 L1', 'Englisch LK1', 'en-lk'],
  ['BI G1', 'Biologie GK1', 'bi'], ['BI G2', 'Biologie GK2', 'bi'], ['BI L1', 'Biologie LK1', 'bi-lk'],
  ['CH G1', 'Chemie GK1', 'ch'], ['CH L1', 'Chemie LK1', 'ch-lk'],
  ['EK G1', 'Erdkunde GK1', 'ek'], ['EK L1', 'Erdkunde LK1', 'ek-lk'], ['EK L2', 'Erdkunde LK2', 'ek-lk'],
  ['GE G1', 'Geschichte GK1', 'ge'], ['GE G2', 'Geschichte GK2', 'ge'], ['GE L1', 'Geschichte LK1', 'ge-lk'],
  ['KR G1', 'Katholische Religionslehre GK1', 're'], ['KR G2', 'Katholische Religionslehre GK2', 're'], ['KR G3', 'Katholische Religionslehre GK3', 're'],
  ['SP G1', 'Sport GK1', 'sp'], ['SP G2', 'Sport GK2', 'sp'], ['SP G3', 'Sport GK3', 'sp'], ['SP G4', 'Sport GK4', 'sp'], ['SP G5', 'Sport GK5', 'sp'],
  ['F7 G1', 'Französisch GK1', 'fr'], ['S0 G1', 'Spanisch, Beginn in der EF GK1', 'es'], ['S9 G1', 'Spanisch, Beginn in Jahrgang 9 GK1', 'es'],
  ['L7 G2', 'Lateinisch GK2', 'la'], ['G0 G3', 'Griechisch GK3', 'gr'], ['IF G1', 'Informatik GK1', 'if'], ['PH G1', 'Physik GK1', 'ph'],
  ['KU G1', 'Kunst GK1', 'ku'], ['MU G1', 'Musik GK1', 'mu'], ['LI G1', 'Literatur GK1', 'li'], ['LI G2', 'Literatur GK2', 'li'],
  ['SW G2', 'Sozialwissenschaften GK2', 'sw'], ['DaF G1', 'Deutsch als Fremdsprache GK 1', 'daf'],
  ['PKACBE', 'Projektkurs AC Business Economics', 'pk-pkacbe'], ['PKACAD', 'Projektkurs AC Art and Design', 'pk-pkacad'],
  ['PKACMS', 'Projektkurs AC Medical Science', 'pk-pkacms'], ['PKKU', 'Projektkurs Kunst', 'pk-pkku'],
  ['PKPL', 'Projektkurs Philosophie', 'pk-pkpl'], ['PKSP1', 'Projektkurs Sport, Ernährung, Gesundheit 1', 'pk-pksp1'],
  ['StL-Std', 'Jahrgangsstufenleitungsstunde', 'stl'],
];
let n = 0;
const t = (a, b, want, what) => {
  assert.strictEqual(US.resolve(a, b), want, `${what || ''} ${JSON.stringify(a)} + ${JSON.stringify(b)} → ${JSON.stringify(US.resolve(a, b))}, erwartet ${want}`);
  n++;
};
for (const [c, l, k] of rows) {
  // Kürzel allein, Kürzel mit Name, nur Name, beides in einem Text (so wie in einer Kalenderzeile) und nur Name als Kürzel
  t(c, '', k); t(c, l, k); t('', l, k); t(c + ' - ' + l, '', k); t(l, '', k);
}
// Andere Schreibweisen und andere Jahrgänge
for (const [a, b, k] of [
  ['M-GK1', '', 'ma'], ['M-LK1', '', 'ma-lk'], ['Ph LK2', '', 'ph-lk'], ['D GK 1', '', 'de'], ['E7 G3', '', 'en'], ['E G1', '', 'en'],
  ['S9 L1', '', 'es-lk'], ['Phi G1', 'Philosophie GK1', 'pl'], ['PA G1', 'Pädagogik GK1', 'pa'],
  ['ER G1', 'Evangelische Religionslehre GK1', 're'], ['Xy', '', ''], ['', '', ''], ['constructor', '', ''], ['__proto__', '', ''],
]) t(a, b, k, 'weitere:');
// Ein neuer Projektkurs, der nicht in der Liste steht
assert.strictEqual(US.resolve('PKINF', ''), 'pk-pkinf');
assert.strictEqual(US.name('pk-pkinf', 'Projektkurs Informatik'), 'Projektkurs Informatik');
assert.strictEqual(US.resolve('', 'Projektkurs Robotik'), 'pk-robotik');
// Namen und Kürzel für die Anzeige
assert.strictEqual(US.name('ma-lk'), 'Mathematik LK');
assert.strictEqual(US.name('es'), 'Spanisch');
assert.strictEqual(US.name('pk-pkku'), 'Projektkurs Kunst');
assert.strictEqual(US.short('de-lk'), 'Deu LK');
assert.strictEqual(US.short('pk-pkku'), 'PKKU');
assert.strictEqual(US.short('stl'), 'StL');
assert.strictEqual(US.short('constructor'), '');
// Grundkurse zusammen, Leistungskurse getrennt, DaF getrennt von Deutsch, beide Spanisch zusammen
assert.strictEqual(new Set(['D G1', 'D G2', 'D G3'].map((c) => US.resolve(c))).size, 1);
assert.notStrictEqual(US.resolve('D G1'), US.resolve('D L2'));
assert.notStrictEqual(US.resolve('DaF G1'), US.resolve('D G1'));
assert.strictEqual(US.resolve('S0 G1'), US.resolve('S9 G1'));
console.log(n + ' Zuordnungen und alle Anzeige-Regeln geprüft, alles richtig');
