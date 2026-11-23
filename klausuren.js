/* =============================================================================
 * klausuren.js – Klausurplan auswerten (reine Logik, kein HTML)
 *
 * Liest die Daten aus klausurplan.js und baut daraus Wochen (Mo–Fr) mit den Klausuren,
 * die für eine Person wirklich gelten:
 *   - EF:     alle Klausuren der Fächer aus dem Untis-Stundenplan (ohne Untis-Daten: alle)
 *   - Q1/Q2:  Grundkurs-Klausur nur, wenn das Fach im Abi-Rechner im Halbjahr als S (schriftlich) belegt ist;
 *             LK-Klausur nur für den eigenen LK im passenden Band (T14/T15, T26/T27).
 *             Welcher LK in welchem Band liegt, steht in klausurplan.js (baender) und hängt am Kurs (L1/L2).
 *             Die Kursnummer kommt aus Untis ('M L2'); ohne sie gilt: Ein Fach, das nur in einem Band
 *             vorkommt, legt dieses Band fest, und die beiden LKs liegen in verschiedenen Bändern.
 * ========================================================================== */
const Klausuren = (() => {
  'use strict';

  // Fach-Kürzel aus dem Klausurplan → Schlüssel aus dem Rechner (constants.js)
  const CODE = {
    D: 'de', E: 'en', E5: 'en', F: 'fr', F7: 'fr', L: 'la', L7: 'la', S0: 'es', S9: 'e9', M: 'ma', BI: 'bi', CH: 'ch',
    PH: 'ph', IF: 'if', EK: 'ek', GE: 'ge', SW: 'sw', KU: 'ku', MU: 'mu', KR: 're', LI: 'li', PL: 'pl', PA: 'pa',
  };
  const NOTE = { hsv: 'inkl. Hör-/Sehverstehen', vorl: 'Text wird von der Lehrkraft vorgelesen', prakt: 'mit praktischem Anteil' };
  const key = (c) => CODE[String(c).toUpperCase()] || '';
  const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
  const RX = /^(LK-T\d+|[A-Za-z]{1,2}\d?)-(\d+|mdl)(?:\s+(.+))?$/i;

  // Datum 'YYYY-MM-DD' ohne Zeitzonen-Ärger
  const two = (n) => String(n).padStart(2, '0'),
    iso = (d) => d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()),
    P = (s) => {
      const [y, m, d] = s.split('-');
      return new Date(+y, m - 1, +d);
    },
    add = (s, n) => {
      const d = P(s);
      d.setDate(d.getDate() + n);
      return iso(d);
    },
    mon = (s) => add(s, -((P(s).getDay() + 6) % 7));

  // Ein Eintrag: Klausur { k, dur, flags } · LK-Klausur { band, dur, flags, per } · sonst Termin { ev, long }
  function token(t) {
    t = String(t).trim();
    const m = RX.exec(t);
    if (!m) return { ev: t, long: t };
    const flags = [],
      per = {};
    list((m[3] || '').replace(/\s+/g, ',')).forEach((f) => {
      const q = /^([A-Za-z]{1,2}\d?):(\w+)$/.exec(f);
      if (q && key(q[1])) per[key(q[1])] = q[2].toLowerCase();
      else flags.push(f.toLowerCase());
    });
    const dur = /^mdl$/i.test(m[2]) ? 0 : +m[2];
    if (/^LK-T/i.test(m[1])) return { band: m[1].slice(3).toUpperCase(), dur, flags, per };
    const k = key(m[1]);
    return k ? { k, dur, flags } : { ev: t, long: t };
  }

  // Bänder einer Stufe: { T14: [{ k: 'ma', nr: 2 }, …], … }
  function bands(plan, stufe) {
    const b = (plan.baender || {})[stufe] || {},
      out = {};
    for (const t of Object.keys(b)) {
      out[t] = list(b[t])
        .map((x) => /^([A-Za-z]{1,2}\d?)-L(\d+)$/i.exec(x))
        .filter((m) => m && key(m[1]))
        .map((m) => ({ k: key(m[1]), nr: +m[2] }));
    }
    return out;
  }

  // Für jeden eigenen LK: die Bänder, in denen er liegen kann (eins = sicher, mehrere = unklar)
  function lkBands(plan, p) {
    const B = bands(plan, p.stufe),
      nr = p.lkNr || {},
      res = {};
    for (const k of p.lks || []) res[k] = Object.keys(B).filter((t) => B[t].some((m) => m.k === k && (nr[k] == null || m.nr === nr[k])));
    // Die beiden LKs liegen in verschiedenen Bändern: ein sicheres Band fällt beim anderen LK weg
    for (let again = true; again; ) {
      again = false;
      for (const k of Object.keys(res)) {
        if (res[k].length !== 1) continue;
        for (const o of Object.keys(res)) {
          if (o !== k && res[o].length > 1 && res[o].includes(res[k][0])) {
            res[o] = res[o].filter((t) => t !== res[k][0]);
            again = true;
          }
        }
      }
    }
    return res;
  }

  // Schreibt die Person in diesem Fach (Grundkurs) Klausuren?
  function written(p, k) {
    if (p.stufe === 'EF') return !p.subs || !p.subs.size || p.subs.has(k);
    return ((p.cells || {})[k] || [])[p.idx] === 'S';
  }

  // Profil p: { stufe: 'EF'|'Q1'|'Q2', idx (0–3 wie SEM), cells (st.cells), lks: ['ma', …], lkNr: { ma: 2 }, subs: Set }
  // Ergebnis: Wochen [{ mon, days: [{ date, off, exams: [{ date, k, lk, band, unsure, dur, flags }], events }] }]
  function build(plan, p) {
    const lb = p.stufe === 'EF' ? {} : lkBands(plan, p),
      offAt = (d) => (plan.frei || []).find(([a, b]) => d >= a && d <= (b || a)),
      weeks = [];
    for (let m = mon(plan.von); m <= plan.bis; m = add(m, 7)) {
      const days = [];
      for (let i = 0; i < 5; i++) {
        const date = add(m, i),
          o = offAt(date),
          e = (plan.tage || {})[date] || {},
          exams = [],
          events = [];
        for (const s of ['alle', p.stufe]) {
          for (const t of list(e[s])) {
            const x = token(t);
            if (x.ev) events.push(x);
            else if (x.band) {
              for (const k of Object.keys(lb)) {
                if (!lb[k].includes(x.band)) continue;
                const pk = x.per[k];
                exams.push({ date, k, lk: true, band: x.band, unsure: lb[k].length > 1, dur: pk === 'mdl' ? 0 : x.dur, flags: pk && pk !== 'mdl' ? [...x.flags, pk] : x.flags });
              }
            } else if (written(p, x.k)) exams.push({ date, k: x.k, lk: false, dur: x.dur, flags: x.flags });
          }
        }
        days.push({ date, off: o ? o[2] : '', exams, events });
      }
      weeks.push({ mon: m, days });
    }
    return weeks;
  }

  const notes = (e) => e.flags.map((f) => NOTE[f]).filter(Boolean);

  // Klausuren als Kalenderdatei (iCalendar) für Apple-, Google- oder Outlook-Kalender:
  // ganztägige Termine (der Plan nennt keine Uhrzeit) mit Erinnerung am Vortag um 9 Uhr.
  // name(e): Fachname, now: Zeitpunkt der Erstellung. Gleiche UID = gleicher Termin, erneutes Importieren ersetzt ihn.
  function ics(exams, name, now) {
    const tx = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'),
      fold = (l) => {
        const out = [];
        for (; l.length > 60; l = ' ' + l.slice(60)) out.push(l.slice(0, 60));
        out.push(l);
        return out.join('\r\n');
      },
      d = (s) => s.replace(/-/g, ''),
      stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''),
      lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Abi-Rechner Gaesdonck//Klausurplan//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Klausuren'];
    for (const e of exams) {
      const title = (e.dur ? 'Klausur ' : 'Mündliche Prüfung ') + name(e) + (e.dur ? ' (' + e.dur + ' Min.)' : ''),
        desc = [...notes(e), e.lk ? 'LK-Band ' + e.band : '', 'Aus dem Klausurplan. Der Vertretungsplan in WebUntis hat Vorrang.'].filter(Boolean).join('\n');
      lines.push(
        'BEGIN:VEVENT',
        'UID:' + d(e.date) + '-' + e.k + (e.lk ? '-lk' : '') + '@abi-rechner-gaesdonck',
        'DTSTAMP:' + stamp,
        'DTSTART;VALUE=DATE:' + d(e.date),
        'DTEND;VALUE=DATE:' + d(add(e.date, 1)),
        'SUMMARY:' + tx(title),
        'DESCRIPTION:' + tx(desc),
        'TRANSP:TRANSPARENT',
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        'DESCRIPTION:' + tx(title),
        'TRIGGER:-PT15H',
        'END:VALARM',
        'END:VEVENT',
      );
    }
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  return { token, bands, lkBands, build, notes, ics, CODE, NOTE, util: { add, mon } };
})();
