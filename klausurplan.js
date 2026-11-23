/* =============================================================================
 * klausurplan.js – Klausurplan des laufenden Halbjahres (reine Daten)
 *
 * Quelle: Klausurplan von Dr. Kattelans (jedes Halbjahr neu). Zum Aktualisieren nur diese Datei ersetzen.
 *
 * tage: Datum → { EF | Q1 | Q2 | alle: 'Eintrag, Eintrag, …' }
 *   Klausur:   Fach-Dauer [Zusätze]     'D-90' · 'E-135' · 'F-mdl' (mündliche Prüfung statt Klausur)
 *              Fächer wie im Plan: D, E, F, L, S0 (Spanisch ab EF), S9 (Spanisch ab Kl. 9), M, BI, CH, PH,
 *              IF, EK, GE, SW, KU, MU, KR, LI.  „KU/MU-180“ aus dem Plan wird als 'KU-180, MU-180' eingetragen.
 *   Zusätze:   hsv (inkl. Hör-/Sehverstehen) · vorl (Text wird vorgelesen) · prakt (praktischer Anteil)
 *   LK-Klausur: 'LK-T14-180' (Band T14, siehe baender); 'E:mdl' / 'E:hsv' gilt nur für den Englisch-LK im Band
 *   Alles andere ist ein Termin ohne Klausur: 'GoDi 8:45 Uhr', 'Halbjahresende', …
 *   Nachschreibtermine (NT) werden NICHT eingetragen: Wer nachschreibt, steht mit Namen in eigenen Listen,
 *   und diese Daten gehören aus Datenschutzgründen nicht in die App.
 * frei: unterrichtsfreie Zeiten [von, bis, Name]
 * ========================================================================== */
const KLAUSURPLAN = {
  titel: 'Klausurplan 2026/27, 1. Halbjahr',
  stand: '10.09.2026, Dr. Kattelans',
  hj: 1, // 1 = erstes Halbjahr (Q1.1 / Q2.1), 2 = zweites Halbjahr (Q1.2 / Q2.2)
  von: '2026-09-07',
  bis: '2027-01-29',
  baender: {
    Q1: {
      T14: 'M-L2, EK-L2, D-L2, E5-L1, GE-L1, KR-L1, PH-L1',
      T15: 'E5-L2, CH-L2, M-L1, EK-L1, CH-L1, BI-L1, D-L1',
    },
    Q2: {
      T26: 'E5-L2, EK-L1, BI-L1, GE-L1, M-L1, D-L1',
      T27: 'D-L2, EK-L2, M-L2, KR-L1, E5-L1, CH-L1, PH-L1',
    },
  },
  frei: [
    ['2026-10-19', '2026-10-30', 'Herbstferien'],
    ['2026-11-16', '2026-11-16', 'Päd. Konferenz'],
    ['2026-12-23', '2027-01-06', 'Weihnachtsferien'],
  ],
  tage: {
    '2026-09-21': { Q2: 'S0-mdl, S9-mdl, F-180 hsv' },
    '2026-09-23': { Q1: 'SW-90' },
    '2026-09-24': { Q1: 'EK-135', Q2: 'EK-180, GE-180, SW-180' },
    '2026-09-28': { Q1: 'L-90 vorl, F-135, S0-90, S9-90' },
    '2026-09-30': { Q2: 'LK-T27-225' },
    '2026-10-01': { Q1: 'E-135' },
    '2026-10-02': { Q2: 'D-155' },
    '2026-10-05': { Q2: 'LK-T26-225' },
    '2026-10-06': { Q1: 'LK-T14-180' },
    '2026-10-07': { EF: 'L-90 vorl' },
    '2026-10-08': { EF: 'E-90, GoDi 8:45 Uhr', Q1: 'D-90' },
    '2026-10-09': { Q2: 'E-180' },
    '2026-10-12': { alle: 'DLW' },
    '2026-10-13': { alle: 'DLW' },
    '2026-10-14': { alle: 'DLW' },
    '2026-10-15': { alle: 'DLW' },
    '2026-10-16': { alle: 'DLW', Q2: 'L-135 vorl' },
    '2026-11-02': { alle: 'GoDi ab 11:40 Uhr' },
    '2026-11-03': { EF: 'S0-90, S9-90', Q1: 'LK-T15-180' },
    '2026-11-04': { Q2: 'KU-180, MU-180, KR-180' },
    '2026-11-05': { Q1: 'GoDi 8:45 Uhr', Q2: 'M-135' },
    '2026-11-06': { EF: 'D-90', Q1: 'GE-90' },
    '2026-11-09': { EF: 'F-90' },
    '2026-11-10': { Q1: 'CH-90, PH-90', Q2: 'BI-155, CH-155, PH-155' },
    '2026-11-11': { EF: 'M-90' },
    '2026-11-12': { Q1: 'M-90', Q2: 'EK-180, GE-180, SW-180' },
    '2026-11-17': { EF: 'GE-90, SW-90' },
    '2026-11-18': { Q1: 'BI-90' },
    '2026-11-19': { EF: 'EK-90', Q1: 'KU-135, MU-135, KR-135', Q2: 'GoDi 8:45 Uhr' },
    '2026-11-24': { EF: 'CH-90, PH-90' },
    '2026-11-25': { Q2: 'L-135 vorl, S0-180, S9-180 hsv, F-180' },
    '2026-11-26': { EF: 'BI-90', Q1: 'EK-135' },
    '2026-11-30': { EF: 'Adventsimpuls 1. Std.', Q1: 'L-90 vorl, F-mdl, S0-90, S9-135', Q2: 'LK-T27-225 E:hsv' },
    '2026-12-02': { EF: 'KU-90, MU-90', Q1: 'SW-90' },
    '2026-12-03': { EF: 'KR-90' },
    '2026-12-04': { Q2: 'D-155' },
    '2026-12-07': { EF: 'Adventsimpuls 1. Std.' },
    '2026-12-08': { Q1: 'LK-T14-180 E:mdl' },
    '2026-12-09': { EF: 'L-90 vorl', Q2: 'KU-225 prakt, MU-180, KR-180' },
    '2026-12-10': { Q1: 'E-mdl', Q2: 'E-180 hsv' },
    '2026-12-11': { EF: 'E-mdl' },
    '2026-12-14': { EF: 'Adventsimpuls 1. Std.', Q2: 'LK-T26-225 E:hsv' },
    '2026-12-15': { EF: 'S0-90, S9-90', Q1: 'LK-T15-180 E:mdl' },
    '2026-12-17': { EF: 'D-90', Q2: 'M-180' },
    '2026-12-18': { Q1: 'CH-90, PH-90' },
    '2026-12-21': { Q1: 'D-90', Q2: 'BI-155, CH-155, PH-155' },
    '2026-12-22': { Q2: 'Halbjahresende' },
    '2027-01-11': { EF: 'F-90 hsv' },
    '2027-01-13': { Q1: 'BI-90' },
    '2027-01-14': { Q1: 'GE-90' },
    '2027-01-15': { EF: 'M-90' },
    '2027-01-18': { Q1: 'M-90' },
    '2027-01-20': { Q1: 'KU-180, MU-135, KR-135' },
  },
};
