/* =============================================================================
 * untis-subjects.js – Fach-Erkennung für Untis-Kurse (reine Logik, kein HTML)
 *
 * Untis-Kurskürzel an Gaesdonck: <Fach><Beginn-Ziffer> <G|L><Nr>
 *   'D G1' = Deutsch GK1 · 'D L2' = Deutsch LK2 · 'E5 G1' = Englisch (ab 5) · 'S0 G1' = Spanisch ab EF
 *   'DaF G1' · 'PKKU' (Projektkurs) · 'StL-Std' (Jahrgangsstufenleitungsstunde)
 *
 * Zuordnung (Gruppe = Schlüssel):
 *   - Grundkurse eines Fachs gehören zusammen:  'D G1', 'D G2', 'D G3'  →  'de'
 *   - Leistungskurse bleiben eigene Gruppen:    'D L2'                  →  'de-lk'
 *   - Beide Spanisch-Kurse (S0, S9) → 'es'; Deutsch als Fremdsprache bleibt 'daf'
 *   - Projektkurse sind je eine eigene Gruppe: 'PKKU' → 'pk-pkku'
 * Die Kürzel können je Jahrgang abweichen. Darum gibt es mehrere Wege, in dieser Reihenfolge:
 *   1. Projektkurs-Kürzel (PK…)   2. Kurskürzel-Muster   3. Stichwörter im Namen ('Mathematik GK1')
 * Was nicht erkannt wird, bleibt offen und lässt sich in der App von Hand zuordnen.
 *
 * Schlüssel der Fächer aus dem Rechner (constants.js, S/NM) bleiben unverändert: de, ma, es, …
 * Neu dazu kommen nur Schlüssel für Dinge, die der Rechner nicht kennt (gr, daf, pl, pa, stl, pk-…).
 * ========================================================================== */
const UntisSubjects = (() => {
  'use strict';

  // Namen in der Planer-Ansicht. Spanisch heißt für beide Beginnjahrgänge einfach „Spanisch“.
  const NAMES = {
    de: 'Deutsch', en: 'Englisch', fr: 'Französisch', la: 'Latein', es: 'Spanisch', e9: 'Spanisch', ku: 'Kunst',
    mu: 'Musik', li: 'Literatur', ek: 'Erdkunde', ge: 'Geschichte', sw: 'Sozialwissenschaften',
    re: 'Kath. Religionslehre', sp: 'Sport', ma: 'Mathematik', bi: 'Biologie', ch: 'Chemie', ph: 'Physik',
    if: 'Informatik', gr: 'Griechisch', daf: 'Deutsch als Fremdsprache', pl: 'Philosophie', pa: 'Pädagogik',
    stl: 'Jahrgangsstufenleitung',
  };
  const SHORT = {
    de: 'Deu', en: 'Eng', fr: 'Fra', la: 'Lat', es: 'Spa', e9: 'Spa', ku: 'Kun', mu: 'Mus', li: 'Lit', ek: 'Ek',
    ge: 'Ges', sw: 'SoWi', re: 'Rel', sp: 'Spo', ma: 'Mat', bi: 'Bio', ch: 'Che', ph: 'Phy', if: 'Inf', gr: 'Gri',
    daf: 'DaF', pl: 'Phi', pa: 'Päd', stl: 'StL',
  };
  // Bekannte Projektkurse (aus der Q1-Liste). Neue Projektkurse werden aus Kürzel und Namen abgeleitet.
  const PK = {
    'pk-pkacbe': 'Projektkurs AC Business Economics',
    'pk-pkacad': 'Projektkurs AC Art and Design',
    'pk-pkacms': 'Projektkurs AC Medical Science',
    'pk-pkku': 'Projektkurs Kunst',
    'pk-pkpl': 'Projektkurs Philosophie',
    'pk-pksp1': 'Projektkurs Sport, Ernährung, Gesundheit 1',
  };
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  // Kurskürzel-Muster: Fach (1 bis 5 Buchstaben) + optionale Ziffer + G oder L (+ optional K) + Nummer
  //   'D G1' · 'E5 L1' · 'DaF G1' · 'M-GK1' · 'Ph LK2'; dahinter darf noch ein Name folgen
  const CODE = /^([A-Za-zÄÖÜäöü]{1,5}?)(\d)?[\s._-]*([GgLl])[Kk]?[\s._-]*(\d{1,2})(?![\dA-Za-z])/;
  // Fach-Kürzel (Großbuchstaben) → Schlüssel; S und G hängen von der Ziffer ab
  const BASE = {
    D: 'de', M: 'ma', E: 'en', F: 'fr', L: 'la', BI: 'bi', CH: 'ch', PH: 'ph', IF: 'if', EK: 'ek', GE: 'ge', SW: 'sw',
    KU: 'ku', MU: 'mu', LI: 'li', SP: 'sp', KR: 're', ER: 're', EV: 're', RE: 're', RK: 're', REL: 're', PL: 'pl', PA: 'pa',
    DAF: 'daf', GR: 'gr',
  };
  // Stichwörter im Namen. Reihenfolge ist wichtig: das Spezielle zuerst.
  const WORDS = [
    [/deutsch\s+als\s+fremdsprache|\bdaf\b/i, 'daf'],
    [/jahrgangsstufenleitung|stufenleitung|\bstl\b/i, 'stl'],
    [/deutsch/i, 'de'], [/mathe/i, 'ma'], [/englisch/i, 'en'], [/franz/i, 'fr'], [/latein/i, 'la'], [/griech/i, 'gr'],
    [/spanisch/i, 'es'], [/biolog/i, 'bi'], [/chemie/i, 'ch'], [/physik/i, 'ph'], [/informatik/i, 'if'],
    [/erdkunde|geograph/i, 'ek'], [/geschichte/i, 'ge'], [/sozialwiss|sowi|politik/i, 'sw'],
    [/religion|\bkath\.|\bevang\./i, 're'], [/philosoph/i, 'pl'], [/p(ä|ae)dagog/i, 'pa'], [/sport/i, 'sp'],
    [/kunst/i, 'ku'], [/musik/i, 'mu'], [/literatur/i, 'li'],
  ];

  const slug = (s) =>
    String(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '').slice(0, 24);
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  function viaCode(s) {
    const m = CODE.exec(s);
    if (!m) return null;
    const b = m[1].toUpperCase(), digit = m[2] || '';
    let key = null;
    if (b === 'S' && digit) key = 'es'; // S0 = Beginn EF, S9 = Beginn Jg. 9: eine gemeinsame Gruppe
    else if (b === 'G' && digit) key = 'gr'; // G0 = Griechisch (GE = Geschichte hat keine Ziffer)
    else if (has(BASE, b)) key = BASE[b];
    return { key, lk: /^l/i.test(m[3]) };
  }
  function viaWords(s) {
    for (const [re, k] of WORDS) if (re.test(s)) return k;
    return null;
  }
  // Projektkurs: Kürzel 'PKKU' / 'PKACBE' oder Name 'Projektkurs Kunst'
  function viaProject(raw, long) {
    for (const s of [raw, long]) {
      const m = /^PK([A-Za-zÄÖÜäöü]+\d*)(?=$|[\s,;:–-])/.exec(norm(s));
      if (m) return 'pk-pk' + m[1].toLowerCase();
    }
    for (const s of [long, raw]) {
      if (!/^\s*projektkurs/i.test(norm(s))) continue;
      const n = norm(s), hit = Object.keys(PK).find((k) => PK[k].toLowerCase() === n.toLowerCase());
      return hit || 'pk-' + slug(n.replace(/^projektkurs\s*/i, ''));
    }
    return null;
  }

  // Hauptfunktion: Untis-Kürzel (raw) und/oder Langname (long) → Schlüssel oder '' wenn unbekannt
  function resolve(raw, long) {
    raw = norm(raw);
    long = norm(long);
    if (!raw && !long) return '';
    const pk = viaProject(raw, long);
    if (pk) return pk;
    let lk = false, key = null;
    for (const s of [raw, long]) {
      const c = s && viaCode(s);
      if (!c) continue;
      lk = c.lk;
      key = c.key;
      if (key) break;
    }
    if (!key) key = viaWords(raw + ' ' + long);
    if (!key) return '';
    if (!lk && /\bLK\s*\d*\b|leistungskurs/i.test(raw + ' ' + long)) lk = true;
    return lk ? key + '-lk' : key;
  }

  // Anzeige: Name, Kürzel für die Plan-Blöcke, ob Leistungskurs
  const split = (k) => ({ base: String(k).replace(/-lk$/, ''), lk: /-lk$/.test(k) });
  function name(k, long) {
    const { base, lk } = split(k);
    const n = base.startsWith('pk-')
      ? (has(PK, base) && PK[base]) || norm(long) || 'Projektkurs ' + base.slice(5).toUpperCase()
      : (has(NAMES, base) && NAMES[base]) || norm(long) || String(k);
    return lk ? n + ' LK' : n;
  }
  function short(k) {
    const { base, lk } = split(k);
    const s = base.startsWith('pk-') ? base.slice(3).toUpperCase() : (has(SHORT, base) && SHORT[base]) || '';
    return s ? (lk ? s + ' LK' : s) : '';
  }
  // Alle Fächer, die man von Hand wählen kann: [Schlüssel, Name, Gruppe]
  function choices() {
    const base = Object.keys(NAMES).filter((k) => k !== 'e9');
    return [
      ...base.map((k) => [k, NAMES[k], 'Fächer (Grundkurs)']),
      ...base.filter((k) => k !== 'stl').map((k) => [k + '-lk', NAMES[k] + ' LK', 'Leistungskurse']),
    ];
  }

  return { resolve, name, short, choices, split, NAMES, PK };
})();
