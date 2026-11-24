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
  ['ek', 'Erdkunde', 'Gesellschaftswissenschaften'],
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

// ---------------------------------------------------------------------------
// Welche Prüfungsordnung gilt? Das hängt am Abiturjahrgang (st.y).
// Die neue APO-GOSt (2027) (BASS 13-32 Nr. 3.1 (2027), in Kraft ab 01.08.2027) gilt nach § 45 erstmals für alle,
// die im Schuljahr 2027/28 die Einführungsphase besuchen, regulär also ab dem Abitur 2030. Wer schon 2027/28 (oder
// früher) in der Q1 war und danach ein Jahr wiederholt, beendet die Oberstufe nach der bisherigen Fassung, auch mit
// Abitur 2030 oder 2031 (st.q1alt). Alte Stände ohne Jahrgang rechnen wie bisher.
// ---------------------------------------------------------------------------
const NEU_AB = 2030,
  isNeu = (s) => !!s && +s.y >= NEU_AB && !s.q1alt,
  // Abiturjahrgänge zur Auswahl: vom laufenden Schuljahr an (ab August zählt das nächste Jahr) sieben Jahre
  JAHRE = (() => {
    const d = new Date(),
      a = d.getFullYear() + (d.getMonth() >= 7 ? 1 : 0);
    return Array.from({ length: 7 }, (_, i) => a + i);
  })();
// Regeln der APO-GOSt (2027) (Abitur ab 2030):
// § 11 Abs. 2, § 26 Abs. 1: genau 40 Kurse belegen (Vertiefungskurse zählen mit, Kurse mit 0 Punkten und Vertiefungskurse
//   „nicht teilgenommen“ gelten als nicht belegt), davon genau 36 in Block I einbringen: die 8 LK und 28 weitere.
// § 27 Abs. 2: LK zweifach, die 28 weiteren einfach; unter den 36 höchstens 7 Defizite (4 oder weniger Punkte), davon
//   höchstens 3 Leistungskurse; Block I mindestens 200. § 27 Abs. 3: Block I = P ÷ S × 40, gerundet (S = 44).
// § 26 Abs. 7: höchstens 2 Literaturkurse. § 38 Abs. 3: Block II = fünf Prüfungen vierfach (max. 300), mindestens 100,
//   in mindestens drei Prüfungsfächern, darunter einem Leistungskursfach, jeweils mindestens 20 Punkte.
const RULE27 = { n: 36, lk: 8, belegt: 40, def: 7, defLK: 3, li: 2, ex: 5, w: 4, need: 3, min: 20 },
  // Projektkurs (Pflicht ab Abitur 2030, § 11 Abs. 9): zwei Halbjahre in der Q2, Code PK in st.cells.pk.
  // An der Gaesdonck kann an seine Stelle eine Advanced Class treten (st.pj.type = 'ac'); gerechnet wird gleich.
  PKC = ['', '', 'PK', 'PK'],
  pjArt = (s) => SP[(s && s.pj && s.pj.type) == 'ac' ? 'ac' : 'pk'],
  // Fachname inklusive Projektkurs (NM selbst bleibt unverändert, Untis nutzt es für die Fächererkennung)
  FN = (id) => (id == 'pk' ? pjArt(typeof st == 'undefined' ? null : st) : NM[id]);
const $ = (s) => document.querySelector(s),
  R = (x) => Math.floor(x + 0.5 + 1e-9),
  num = (v) => (v === '' || v == null ? null : +v),
  f1 = (x) => (x == null ? '–' : x.toFixed(1).replace('.', ',')),
  esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => '&#' + c.charCodeAt(0) + ';');
