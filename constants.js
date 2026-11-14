const K = 'abirechner.gaesdonck.v1';
const S = [
  ['de', 'Deutsch', 'Aufgabenfeld I'],
  ['en', 'Englisch'],
  ['fr', 'Französisch'],
  ['la', 'Latein'],
  ['es', 'Spanisch (ab EF)'],
  ['e9', 'Spanisch (ab Kl. 9)'],
  ['ku', 'Kunst'],
  ['mu', 'Musik'],
  ['li', 'Literatur'],
  ['ek', 'Erdkunde', 'Aufgabenfeld II'],
  ['ge', 'Geschichte'],
  ['sw', 'Sozialwissenschaften'],
  ['re', 'Kath. Religionslehre'],
  ['sp', 'Sport', 'Ohne Aufgabenfeld'],
  ['ma', 'Mathematik', 'Aufgabenfeld III'],
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
const SP = { pk: 'Projektkurs', ac: 'Advanced Class', fa: 'Facharbeit' };
const $ = (s) => document.querySelector(s),
  R = (x) => Math.floor(x + 0.5 + 1e-9),
  num = (v) => (v === '' || v == null ? null : +v),
  f1 = (x) => (x == null ? '–' : x.toFixed(1).replace('.', ',')),
  esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => '&#' + c.charCodeAt(0) + ';');
