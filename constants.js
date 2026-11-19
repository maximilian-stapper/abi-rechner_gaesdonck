const K = 'abirechner.gaesdonck.v1';
const S = [
  ['de', 'Deutsch', 'Sprachen'],
  ['en', 'Englisch'],
  ['fr', 'Französisch'],
  ['la', 'Latein'],
  ['es', 'Spanisch (ab EF)'],
  ['e9', 'Spanisch (ab Kl. 9)'],
  ['ku', 'Kunst'],
  ['mu', 'Musik'],
  ['li', 'Literatur'],
  ['ek', 'Erdkunde', 'Sozialwissenschaften'],
  ['ge', 'Geschichte'],
  ['sw', 'Sozialwissenschaften'],
  ['re', 'Kath. Religionslehre'],
  ['sp', 'Sport', 'Ohne Aufgabenfeld'],
  ['ma', 'Mathematik', 'Naturwissenschaften'],
  ['bi', 'Biologie'],
  ['ch', 'Chemie'],
  ['ph', 'Physik'],
  ['if', 'Informatik'],
];
const NM = Object.fromEntries(S.map((s) => [s[0], s[1]])),
  SEM = ['Q1.1', 'Q1.2', 'Q2.1', 'Q2.2'],
  CODES = ['', 'S', 'M', 'LK', 'ZK'];
const FS = ['en', 'fr', 'la', 'e9', 'es'],
  NW = ['ph', 'ch', 'bi'],
  GW = ['ek', 'ge', 'sw'];
const NT = [
  '6',
  '5−',
  '5',
  '5+',
  '4−',
  '4',
  '4+',
  '3−',
  '3',
  '3+',
  '2−',
  '2',
  '2+',
  '1−',
  '1',
  '1+',
];
// Projektkurs bzw. Advanced Class (Gaesdonck): ein Jahreskurs in Q1, eine Abschlussnote, freiwillig einzubringen.
// Die Facharbeit gehört nicht hierher: Sie ersetzt nur eine Klausur in Q1.2 und wird dort als Klausurnote eingetragen.
const SP = { pk: 'Projektkurs', ac: 'Advanced Class' };
// Regeln der APO-GOSt NRW (Fassung ab 01.08.2025, gilt für das Abitur 2028):
// § 28 Abs. 1: 35 bis 40 Halbjahresergebnisse in Block I; mindestens 38 anrechenbare Kurse (30 GK + 8 LK) belegt.
// § 29 Abs. 3: bei 35 bis 37 Kursen höchstens 7, bei 38 bis 40 höchstens 8 Defizite (4 oder weniger Punkte), davon höchstens 3 im LK.
// § 28 Abs. 8: höchstens 2 Literaturkurse anrechenbar.
const RULE = { min: 35, max: 40, split: 37, defLo: 7, defHi: 8, defLK: 3, belegt: 38, li: 2 },
  // So viele Halbjahresergebnisse zählen Projektkurs und Advanced Class, falls sie eingebracht werden
  // (§ 28 Abs. 10; VV 28.10: bei 4 oder weniger Punkten auch zwei Defizite).
  SPW = { pk: 2, ac: 2 },
  // Mögliche Schwerpunktfächer (neuntes Pflichtfach, § 11 Abs. 5): weitere Fremdsprache oder weiteres MINT-Fach.
  SF = [...FS, 'bi', 'ch', 'ph', 'if'];
const $ = (s) => document.querySelector(s),
  R = (x) => Math.floor(x + 0.5 + 1e-9),
  num = (v) => (v === '' || v == null ? null : +v),
  f1 = (x) => (x == null ? '–' : x.toFixed(1).replace('.', ',')),
  esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => '&#' + c.charCodeAt(0) + ';');
