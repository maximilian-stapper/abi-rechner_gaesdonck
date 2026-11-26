/* =============================================================================
 * untis-ui.js – Oberfläche für den Untis-Planer (Stundenplan + Hausaufgaben)
 *
 * Nutzt untis.js (Untis), untis-subjects.js (Fach-Erkennung), untis-mobile.js (Anmeldung ohne Passwort)
 * sowie $, esc, K, st, tab aus den anderen Dateien. views.js ruft head() und view() auf.
 * Alle Aktionen laufen über data-u="…" (getrennt von data-a/-e/-t/-c in events.js).
 *
 * WICHTIG: Fachnamen, Lehrer, Räume und Hausaufgabentexte sind Fremdtext.
 *          Sie gehen im HTML IMMER durch esc(), nie roh in innerHTML.
 * ========================================================================== */
const UntisUI = (() => {
  'use strict';
  const U = Untis,
    US = UntisSubjects,
    UM = UntisMobile,
    UP = UntisPush; // Hausaufgaben-Erinnerungen (Karte unter den Hausaufgaben)

  // Zeitrahmen des Plans: nur dieser Bereich wird gezeigt (Termine außerhalb werden gekürzt oder ausgeblendet)
  const FROM = '07:55',
    TO = '18:30',
    PX = 0.9; // Pixel pro Minute
  // Stundenraster der Gaesdonck (fest): sechs Stunden mit Pausen, Mittagspause, dann Nachmittag bis 18:30.
  // Daraus entstehen die feinen Hintergrundlinien im Wochenplan (grid).
  const SLOTS = [
    ['07:55', '08:40'], ['08:45', '09:30'],
    ['09:50', '10:35'], ['10:40', '11:25'],
    ['11:40', '12:25'], ['12:25', '13:10'],
    ['13:50', '14:35'], ['14:35', '15:20'],
    ['15:25', '16:10'], ['16:10', '16:55'],
    ['17:00', '17:45'], ['17:45', '18:30'],
  ];

  // Server (gaesdonck.webuntis.com), Schule und Worker stehen fest in untis.js (FIX) und müssen nie eingetragen werden.

  // ---------- Hilfen ----------
  const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
    MO = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'],
    mins = (t) => +t.slice(0, 2) * 60 + +t.slice(3),
    F = mins(FROM),
    T = mins(TO),
    two = (n) => String(n).padStart(2, '0'),
    P = (s) => {
      const [y, m, d] = s.split('-');
      return new Date(+y, m - 1, +d);
    },
    wdOf = (s) => (P(s).getDay() + 6) % 7,
    fmt = (s) => {
      const d = P(s);
      return WD[wdOf(s)] + ' ' + d.getDate() + '.' + (d.getMonth() + 1) + '.';
    },
    kw = (s) => {
      const d = P(s);
      d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
      const w1 = new Date(d.getFullYear(), 0, 4);
      return 1 + Math.round(((d - w1) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7);
    },
    stamp = (ms) => {
      const d = new Date(ms);
      return WD[(d.getDay() + 6) % 7] + ' ' + d.getDate() + '.' + (d.getMonth() + 1) + '., ' + two(d.getHours()) + ':' + two(d.getMinutes());
    },
    own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  // ---------- Fächer: Schlüssel, Name, Kürzel, Farbe ----------
  // Der Schlüssel kommt aus der Fach-Erkennung (untis-subjects.js): 'de', 'de-lk', 'es', 'gr', 'pk-pkku' …
  // Was nicht erkannt wird, bleibt unter seinem Untis-Namen stehen und lässt sich in „Einrichten“ zuordnen.
  const key = (x) => x.sub || x.subName || '?',
    label = (x) => (x.sub ? US.name(x.sub, x.subLong) : x.subLong || x.subName || 'Sonstige'),
    short = (l) => US.short(key(l)) || String(l.subName || '?').split(/[\s\-_./\d]/)[0].slice(0, 5) || '?',
    HU = new Map(
      Object.entries({
        de: 345, en: 25, fr: 200, la: 45, es: 325, e9: 325, ku: 285, mu: 305, li: 262, ek: 150, ge: 75, sw: 100, re: 238,
        sp: 175, ma: 215, bi: 125, ch: 165, ph: 190, if: 8, gr: 60, daf: 355, pl: 255, pa: 12,
      }),
    ),
    // Gleiches Fach, gleicher Farbton: Grund- und Leistungskurs unterscheiden sich nur durch die Randstärke
    hue = (k) => {
      const b = US.split(k).base;
      if (HU.has(b)) return HU.get(b);
      let h = 7;
      for (const c of String(b)) h = (h * 31 + c.charCodeAt(0)) % 360;
      return h;
    },
    isLk = (k) => US.split(k).lk;

  // ---------- Hausaufgaben: Überfälliges wird nie gezeigt (Lehrkräfte haken Erledigtes nicht ab) ----------
  const vis = (h) => !h.due || h.due >= U.util.today(),
    hws = () => U.homework().filter(vis).sort((a, b) => (a.due || '9').localeCompare(b.due || '9')); // ohne Fälligkeit ans Ende

  // Alle Fächer, die im Plan oder bei den Hausaufgaben vorkommen: Map Schlüssel → Name
  function subjects() {
    const m = new Map(),
      add = (x) => {
        const k = key(x);
        if (!m.has(k)) m.set(k, label(x));
      },
      td = U.util.today();
    U.range(U.util.add(td, -14), U.util.add(td, 63)).forEach(add);
    hws().forEach(add);
    return m;
  }

  // ---------- Eigene Einstellungen (getrennt von den Untis-Daten, nie in der Sicherungsdatei) ----------
  const SK = (typeof K !== 'undefined' ? K : 'abirechner') + '.untis.ui', // { ical, mUser }
    SS = SK + '.key', // Untis-Mobile-Schlüssel: nur auf diesem Gerät
    SP = SK + '.pw'; // Microsoft-Passwort: nur, wenn „Passwort merken“ angehakt ist, nur auf diesem Gerät
  const ux = () => {
      try {
        return Object.assign({ ical: '', mUser: '' }, JSON.parse(localStorage.getItem(SK)) || {});
      } catch (e) {
        return { ical: '', mUser: '' };
      }
    },
    uxSet = (p) => {
      const x = Object.assign(ux(), p);
      try {
        localStorage.setItem(SK, JSON.stringify(x));
      } catch (e) {}
      return x;
    },
    keyGet = () => {
      try {
        return localStorage.getItem(SS) || '';
      } catch (e) {
        return '';
      }
    },
    keySet = (k) => {
      try {
        if (k) localStorage.setItem(SS, k);
        else localStorage.removeItem(SS);
      } catch (e) {}
    };
  const pwGet = () => {
      try {
        return localStorage.getItem(SP) || '';
      } catch (e) {
        return '';
      }
    },
    pwSet = (v) => {
      try {
        if (v) localStorage.setItem(SP, v);
        else localStorage.removeItem(SP);
      } catch (e) {}
    };
  function wipe() {
    try {
      localStorage.removeItem(SK);
      localStorage.removeItem(SS);
      localStorage.removeItem(SP);
    } catch (e) {}
    UP.reset(); // Erinnerungen aus, Kopie beim Erinnerungs-Worker löschen
  }
  function defaults() {} // feste Adressen setzt untis.js selbst (bleibt für events.js erhalten)
  U.setResolver(US.resolve);
  defaults();

  // ---------- Zustand der Oberfläche ----------
  const homeWeek = () => {
    const t = U.util.today(),
      m = U.util.mon(t);
    return wdOf(t) >= 5 ? U.util.add(m, 7) : m; // Wochenende: gleich die kommende Woche zeigen
  };
  let view = 'plan', // 'plan' | 'setup'
    wk = homeWeek(),
    hwAll = false,
    pw = '', // eingetipptes Passwort (nur im Speicher; gespeichert nur mit „Passwort merken“)
    msg = null, // { c: 'ok'|'warn'|'err', t }
    lastTab = 'ov',
    uiBusy = false,
    cur = null; // geöffnetes Fach-Blatt { k, ls }

  const mine = (t) => t === 'un' || t === 'kp', // Tabs, die dieses Modul zeichnet: Untis und Klausuren
    active = () => mine(tab) && !!st;

  // ---------- Kopfzeile: Umschalter Abi-Rechner | Untis | Klausuren ----------
  const head = (t) => {
    const b = (u, on, l) => `<button type=button data-u=${u} aria-pressed="${on}" class="${on ? 'on' : ''}">${l}</button>`;
    return `<div class=seg role=group aria-label="Bereich">${b('abi', !mine(t), 'Abi-Rechner')}${b('un', t === 'un', 'Untis')}${b('kpt', t === 'kp', 'Klausuren')}</div>`;
  };

  const view_ = () => (tab === 'kp' ? kpView() : view === 'setup' ? setup() : plan());

  // ---------- Hausaufgaben ----------
  function due(h) {
    const t = U.util.today();
    if (!h.due) return { t: 'ohne Datum', c: '' };
    if (h.due === t) return { t: 'heute fällig', c: 'now' };
    if (h.due === U.util.add(t, 1)) return { t: 'morgen fällig', c: 'soon' };
    return { t: 'fällig ' + fmt(h.due), c: '' };
  }
  // lnk = true: Zeile in der Übersicht (Tippen öffnet das Fach), sonst im Fach-Blatt
  function hwItem(h, lnk, reg) {
    const k = key(h),
      d = due(h),
      body = `${lnk ? `<div class=sn>${esc(reg.get(k) || US.name(k, h.subName))}</div>` : ''}<div class=t>${esc(h.text || '(ohne Text)')}</div>${h.remark ? `<div class=r>${esc(h.remark)}</div>` : ''}<small class="due ${d.c}">${esc(d.t)}${h.teacher ? ' · ' + esc(h.teacher) : ''}${h.src === 'manual' ? ' · selbst eingetragen' : ''}</small>`;
    return `<div class="un-hw${h.done ? ' dn' : ''}" style="--h:${hue(k)}"><button type=button class=uchk data-u=chk data-id="${esc(h.id)}" aria-pressed="${!!h.done}" aria-label="${h.done ? 'Als offen markieren' : 'Als erledigt markieren'}"></button>${lnk ? `<button type=button class=un-hb data-u=sub data-k="${esc(k)}">${body}</button>` : `<div class=un-hb>${body}</div>`}${!lnk && h.src === 'manual' ? `<button type=button class=ux data-u=hwdel data-id="${esc(h.id)}" aria-label="Hausaufgabe löschen">✕</button>` : ''}</div>`;
  }

  // Stunde, zu der eine Hausaufgabe fällig ist → { k, date, start } oder null.
  // Mit Fälligkeit: die erste Stunde des Fachs an diesem Tag (eine ausfallende nur, wenn es an dem Tag keine andere gibt),
  // sonst die nächste Stunde danach. Ohne Fälligkeit: die nächste Stunde ab jetzt.
  function hwLesson(h) {
    const k = key(h),
      td = U.util.today(),
      now = new Date(),
      nowT = two(now.getHours()) + ':' + two(now.getMinutes()),
      d0 = h.due && h.due > td ? h.due : td;
    for (let i = 0; i <= 56; i++) {
      const d = U.util.add(d0, i),
        a = U.day(d).filter((x) => key(x) === k && (h.due || d > td || x.end > nowT)),
        l = a.find((x) => x.status !== 'cancelled') || (i === 0 && h.due ? a[0] : null);
      if (l) return { k, date: d, start: l.start };
    }
    return null;
  }
  // Liegt die fällige Stunde t im (evtl. zur Doppelstunde zusammengefassten) Block l?
  const hwAt = (t, l) => !!t && t.k === key(l) && t.date === l.date && t.start >= l.start && t.start < l.end;

  // ---------- Stundenplan ----------
  // Überlappende Termine nebeneinander legen (Spuren)
  function lay(a) {
    const out = [],
      lanes = [];
    let cl = [],
      end = 0;
    const flush = () => {
      const n = Math.max(...cl.map((x) => x.lane)) + 1;
      cl.forEach((x) => (x.n = n));
      out.push(...cl);
      cl = [];
    };
    for (const x of a) {
      if (cl.length && x.s >= end) {
        flush();
        lanes.length = 0;
      }
      let i = lanes.findIndex((e) => e <= x.s);
      if (i < 0) i = lanes.length;
      lanes[i] = x.e;
      x.lane = i;
      cl.push(x);
      end = Math.max(end, x.e);
    }
    if (cl.length) flush();
    return out;
  }
  const STX = { cancelled: 'entfällt', changed: 'geändert', exam: 'Klausur' },
    PLAN_HUE = 212; // alle normalen Stunden im Wochenplan in einem ruhigen Blau (passend zu --b)

  // Klausurtage laut Klausurplan: an jedem Tag mit Stunden, auch wenn Untis die Klausur schon selbst zeigt
  function kpDay(d) {
    if (!d.lessons.length) return [];
    return kpList.filter((e) => e.date === d.date);
  }

  // due: Liste der fälligen Stunden offener Hausaufgaben (hwLesson); die Zahl steht nur an genau dieser Stunde
  function grid(w, due) {
    const td = U.util.today(),
      H = Math.round((T - F) * PX),
      y = (m) => Math.round((m - F) * PX),
      cols = w.days.length;
    let hidden = 0;
    const hl = [];
    for (let h = Math.ceil(F / 60); h * 60 <= T; h++) hl.push(h);
    // Linien zwischen den Stunden: kurze Pause (≤ 5 min) → eine Linie in der Mitte, längere Pause → Linie an Ende und Anfang
    const sl = [];
    for (let i = 1; i < SLOTS.length; i++) {
      const a = mins(SLOTS[i - 1][1]),
        b = mins(SLOTS[i][0]);
      if (b - a <= 5) sl.push((a + b) / 2);
      else sl.push(a, b);
    }
    const axis = hl.map((h) => `<i style="top:${y(h * 60)}px">${h}:00</i>`).join(''),
      lines = sl
        .filter((m) => m > F && m < T)
        .map((m) => `<i class=hl style="top:${y(m)}px"></i>`)
        .join(''),
      marks = new Map(w.days.map((d) => [d.date, kpDay(d)])),
      heads = w.days
        .map((d) => {
          const ex = marks.get(d.date),
            tags = ex.length
              ? `<span class=un-kts>${ex.map((e) => `<button type=button class=un-kt data-u=kpx data-i=${kpList.indexOf(e)} aria-label="${esc('Laut Klausurplan: ' + US.name(kpKey(e)) + (e.dur ? ', ' + e.dur + ' Minuten' : ', mündlich') + (e.unsure ? ', falls dein Kurs im Band ' + e.band + ' liegt' : ''))}">${esc(US.short(e.k) || e.k)}${e.unsure ? '?' : ''}</button>`).join('')}</span>`
              : '';
          return `<div class="un-dh${d.date === td ? ' today' : ''}"><b>${WD[d.wd]}</b><small>${P(d.date).getDate()}.</small>${tags}</div>`;
        })
        .join(''),
      now = new Date(),
      nowM = now.getHours() * 60 + now.getMinutes(),
      colsHtml = w.days
        .map((d) => {
          const items = []; // Stunden unter einer Klausur hat untis.js (day) schon entfernt
          for (const l of d.lessons) {
            const s = Math.max(mins(l.start), F),
              e = Math.min(mins(l.end), T);
            if (e <= s) {
              hidden++;
              continue;
            }
            items.push({ l, s, e });
          }
          const blocks = lay(items)
            .map(({ l, s, e, lane, n }) => {
              const k = key(l),
                h = Math.max(Math.round((e - s) * PX) - 2, 14),
                cnt = due.filter((t) => hwAt(t, l)).length,
                sx = STX[l.status] || '',
                cls = (l.status === 'cancelled' ? ' x' : l.status === 'changed' ? ' c' : l.status === 'exam' ? ' e' : '') + (isLk(k) ? ' is-lk' : '');
              return `<button type=button class="un-ls${cls}" data-u=ls data-k="${esc(k)}" data-d="${d.date}" data-id="${esc(l.id)}" data-s="${l.start}" style="--h:${PLAN_HUE};top:${y(s) + 1}px;height:${h}px;left:calc(${(lane / n) * 100}% + 1px);width:calc(${100 / n}% - 2px)" aria-label="${esc(label(l) + ', ' + l.start + ' bis ' + l.end + (sx ? ', ' + sx : '') + (cnt ? ', ' + cnt + (cnt === 1 ? ' Hausaufgabe' : ' Hausaufgaben') + ' auf diese Stunde' : ''))}"><b>${esc(short(l))}</b>${l.status === 'exam' && h >= 30 ? '<small>Klausur</small>' : ''}${h >= (l.status === 'exam' ? 44 : 30) && l.room && !(l.status === 'exam' && /klausur/i.test(l.room)) ? `<small>${esc(l.room)}</small>` : ''}${cnt ? `<span class=un-bg>${cnt}</span>` : ''}</button>`;
            })
            .join('');
          const line = d.date === td && nowM >= F && nowM <= T ? `<i class=un-now style="top:${y(nowM)}px"></i>` : '';
          return `<div class="un-col${d.date === td ? ' today' : ''}${marks.get(d.date).length ? ' kp-on' : ''}" style="height:${H}px">${lines}${blocks}${line}</div>`;
        })
        .join('');
    return {
      html: `<div class=un-g style="--cols:${cols}"><div></div>${heads}</div><div class=un-g style="--cols:${cols}"><div class=un-ax style="height:${H}px">${axis}</div>${colsHtml}</div>`,
      hidden,
    };
  }

  function plan() {
    const td = U.util.today(),
      s = U.status(),
      w = U.week(wk, { merge: 10 }),
      hw = hws(),
      open = new Map(),
      reg = subjects(),
      has = s.lessons > 0 || s.homework > 0,
      weekLessons = w.days.reduce((n, d) => n + d.lessons.length, 0),
      kp = kpData();
    hw.filter((h) => !h.done).forEach((h) => open.set(key(h), (open.get(key(h)) || 0) + 1));

    const banner = msg
      ? `<div class="un-msg ${msg.c}" role=status><span>${esc(msg.t)}</span><button type=button class=ux data-u=mx aria-label="Meldung schließen">✕</button></div>`
      : '';

    // Noch nichts eingerichtet
    const first = !has
      ? `<div class=g><h2>Stundenplan und Hausaufgaben</h2><p class=d>Hier erscheinen deine Fächer bunt im Wochenplan, und mit einem Tipp auf ein Fach siehst du die Hausaufgaben. Die Anmeldung läuft über dein Microsoft-Konto, ein Untis-Passwort ist nicht nötig.</p><div class=bar style="justify-content:flex-start"><button type=button class="bt pr" data-u=setup>Untis einrichten</button></div></div>`
      : '';

    // Als Nächstes
    const nx = has ? U.next() : null,
      nxt = nx
        ? `<button type=button class=un-nx data-u=ls data-k="${esc(key(nx))}" data-d="${nx.date}" data-id="${esc(nx.id)}" data-s="${nx.start}" style="--h:${PLAN_HUE}"><span class=dot></span><b>${nx.running ? 'Jetzt' : 'Als Nächstes'}</b><span class=nm>${esc(label(nx))}</span><small>${nx.date === td ? '' : fmt(nx.date) + ' '}${nx.start}${nx.room ? ' · ' + esc(nx.room) : ''}</small></button>`
        : '';

    // Wochenplan
    let g = '',
      note = '';
    if (has) {
      const r = grid(
        w,
        hw.filter((h) => !h.done).map(hwLesson).filter(Boolean),
      );
      g = weekLessons ? `<div data-swap=un-week data-key=${w.from}>${r.html}</div>` : `<p data-swap=un-week data-key=${w.from} class=d style="padding:14px 4px">In dieser Woche sind keine Stunden gespeichert${s.range && s.range[0] ? ` (letzter Abgleich: ${fmt(s.range[0])} bis ${fmt(s.range[1])})` : ''}.</p>`;
      if (r.hidden) note += `<small class="d un-nt">${r.hidden} Termin${r.hidden == 1 ? '' : 'e'} außerhalb von ${FROM} bis ${TO} ${r.hidden == 1 ? 'wird' : 'werden'} nicht angezeigt.</small>`;
    }
    const um = U.unmapped();
    if (um.length) note += `<small class="d un-nt">${um.length} Fach${um.length == 1 ? '' : 'e'} nicht erkannt: ${um.slice(0, 4).map(esc).join(', ')}${um.length > 4 ? ' …' : ''} <button type=button class=lk data-u=setup>Zuordnen</button></small>`;

    const wlabel = (() => {
      const a = P(w.from),
        b = P(U.util.add(w.from, 4));
      return a.getMonth() === b.getMonth() ? `${a.getDate()}.–${b.getDate()}. ${MO[b.getMonth()]}` : `${a.getDate()}. ${MO[a.getMonth()]} – ${b.getDate()}. ${MO[b.getMonth()]}`;
    })();
    const busy = uiBusy || s.busy;

    const planCard = has
      ? `<div class=g id=un-plan><div class=un-nav><button type=button class=ib data-u=prev aria-label="Vorige Woche">‹</button><div class=wk><b>KW ${kw(w.from)}</b><small>${wlabel}</small></div><button type=button class=ib data-u=next aria-label="Nächste Woche">›</button><button type=button class=bt data-u=today${w.from === homeWeek() ? ' disabled' : ''}>Heute</button><button type=button class="ib un-rf" data-u=sync ${busy ? 'data-busy=1 disabled ' : ''}aria-label="Stundenplan aktualisieren" title="Aktualisieren"><svg viewBox="0 0 24 24" width=18 height=18 fill=none stroke=currentColor stroke-width=2.2 stroke-linecap=round stroke-linejoin=round aria-hidden=true><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg></button></div>${g}<div class=un-foot>${note}${s.lastSync ? `<small class=d>Stand: ${stamp(s.lastSync)}</small>` : ''}<span class=sp></span><button type=button class=lk data-u=setup>Einrichten</button></div></div>`
      : '';

    // Hausaufgaben (Überfälliges fehlt absichtlich)
    const list = hwAll ? hw : hw.filter((h) => !h.done),
      chips = [...reg.entries()]
        .sort((a, b) => a[1].localeCompare(b[1], 'de'))
        .map(([k, n]) => `<button type=button class=un-chip data-u=sub data-k="${esc(k)}" style="--h:${hue(k)}">${esc(n)}${open.get(k) ? `<em>${open.get(k)}</em>` : ''}</button>`)
        .join('');
    const hwCard = `<div class=g><div class=un-hh><h2>Hausaufgaben</h2><div class=un-tg role=group aria-label="Anzeige"><button type=button data-u=hwall data-v=0 aria-pressed="${!hwAll}" class="${!hwAll ? 'on' : ''}">Offen</button><button type=button data-u=hwall data-v=1 aria-pressed="${hwAll}" class="${hwAll ? 'on' : ''}">Alle</button></div></div>${chips ? `<div class=un-chips>${chips}</div>` : ''}${list.length ? list.map((h) => hwItem(h, true, reg)).join('') : `<p class=d style="margin:10px 0">${hwAll ? 'Noch keine Hausaufgaben.' : 'Keine offenen Hausaufgaben.'}</p>`}<div class=bar style="justify-content:flex-start"><button type=button class=bt data-u=hwnew data-k="">+ Hausaufgabe</button></div></div>`;

    return banner + first + nxt + planCard + hwCard + (has ? UP.card() : '');
  }

  // ---------- Klausurplan (klausurplan.js + klausuren.js) ----------
  // Nur die Klausuren der eigenen schriftlichen Fächer, dazu Ferien und schulfreie Tage, Woche für Woche
  const KP = typeof KLAUSURPLAN !== 'undefined' ? KLAUSURPLAN : null,
    KL = typeof Klausuren !== 'undefined' ? Klausuren : null,
    MOL = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
    WDL = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'],
    STUFEN = ['EF', 'Q1', 'Q2'],
    dm = (s) => P(s).getDate() + '.' + (P(s).getMonth() + 1) + '.';
  let kpPast = false,
    kpList = []; // Klausuren der letzten Anzeige (data-i zeigt hierauf)

  // Stufe: selbst gewählt, sonst aus der Untis-Klasse ('Q1'), sonst Q1
  function kpStufe() {
    const x = ux().stufe;
    if (STUFEN.includes(x)) return x;
    const td = U.util.today(),
      n = {};
    U.range(U.util.add(td, -14), U.util.add(td, 28)).forEach((l) => {
      const m = /\b(EF|Q1|Q2)\b/i.exec(l.cls || '');
      if (m) n[m[1].toUpperCase()] = (n[m[1].toUpperCase()] || 0) + 1;
    });
    return Object.keys(n).sort((a, b) => n[b] - n[a])[0] || 'Q1';
  }
  function kpProfile() {
    const stufe = kpStufe(),
      idx = (stufe === 'Q2' ? 2 : 0) + (KP.hj === 2 ? 1 : 0), // Halbjahr wie SEM: Q1.1, Q1.2, Q2.1, Q2.2
      cells = (st && st.cells) || {},
      lks = stufe === 'EF' ? [] : Object.keys(cells).filter((k) => (cells[k] || [])[idx] === 'LK'),
      lkNr = {},
      subs = new Set(),
      td = U.util.today();
    // Aus Untis: welche Fächer im Plan stehen (für die EF) und die LK-Kursnummer ('M L2' → 2) für die Bänder
    U.range(U.util.add(td, -28), U.util.add(td, 28)).forEach((l) => {
      const { base, lk } = US.split(key(l));
      subs.add(base === 'es' && /^S9/i.test(l.subName || '') ? 'e9' : base);
      const m = lk && /L[Kk]?[\s._-]*(\d{1,2})(?!\d)/.exec(l.subName || '');
      if (m) lkNr[base] = +m[1];
    });
    return { stufe, idx, cells, lks, lkNr, subs };
  }
  const kpKey = (e) => (e.lk ? e.k + '-lk' : e.k),
    kpDur = (e) => (e.dur ? e.dur + ' Min.' : 'mündlich'),
    kpIn = (d, td) => {
      const n = Math.round((P(d) - P(td)) / 864e5);
      return n === 0 ? 'heute' : n === 1 ? 'morgen' : 'in ' + n + ' Tagen';
    };

  // Klausurplan für die aktuelle Person auswerten (einmal pro Anzeige, für Wochenplan und Karte)
  function kpData() {
    if (!KP || !KL) return null;
    const p = kpProfile(),
      weeks = KL.build(KP, p);
    kpList = weeks.flatMap((w) => w.days.flatMap((d) => d.exams));
    return { p, weeks };
  }

  function kpCard(td, kp) {
    if (!kp) return '';
    const { p, weeks } = kp,
      sem = p.stufe === 'EF' ? 'EF' : SEM[p.idx],
      toggle = `<div class=un-tg role=group aria-label="Stufe">${STUFEN.map((s) => `<button type=button data-u=kpst data-v=${s} aria-pressed="${s === p.stufe}" class="${s === p.stufe ? 'on' : ''}">${s}</button>`).join('')}</div>`;
    const upcoming = kpList.filter((e) => e.date >= td),
      nx = upcoming[0],
      noWritten = p.stufe !== 'EF' && !Object.values(p.cells).some((c) => c && (c[p.idx] === 'S' || c[p.idx] === 'LK'));

    // Wochen: vergangene einklappen, ganze Ferienwochen zu einer Zeile zusammenfassen, Monatsnamen dazwischen
    const past = weeks.filter((w) => U.util.add(w.mon, 4) < td),
      shown = kpPast ? weeks : weeks.filter((w) => U.util.add(w.mon, 4) >= td),
      rows = [];
    let lastMo = -1;
    for (let i = 0; i < shown.length; i++) {
      const w = shown[i],
        off = w.days.every((d) => d.off) && w.days.every((d) => d.off === w.days[0].off) ? w.days[0].off : '',
        mo = P(U.util.add(w.mon, 3)).getMonth();
      if (mo !== lastMo) {
        rows.push(`<div class=kp-mo>${MOL[mo]}${mo === 0 || lastMo === -1 ? ' ' + P(U.util.add(w.mon, 3)).getFullYear() : ''}</div>`);
        lastMo = mo;
      }
      if (off) {
        let j = i;
        while (j + 1 < shown.length && shown[j + 1].days.every((d) => d.off === off)) j++;
        const last = shown[j],
          kws = kw(w.mon) + (j > i ? '–' + kw(last.mon) : '');
        rows.push(`<div class="kp-wk kp-fw"><div class=kp-kw><b>${kws}</b></div><div class=kp-off><b>${esc(off)}</b><small>${dm(w.mon)}–${dm(U.util.add(last.mon, 4))}</small></div></div>`);
        i = j;
        continue;
      }
      const isCur = w.mon === U.util.mon(td),
        cells = w.days
          .map((d, di) => {
            const prevOff = di > 0 && w.days[di - 1].off === d.off;
            const ex = d.exams
              .map((e) => {
                const k = kpKey(e),
                  n = kpList.indexOf(e);
                return `<button type=button class="kp-x${e.unsure ? ' q' : ''}${e.date < td ? ' pa' : ''}" data-u=kpx data-i=${n} style="--h:${hue(k)}" aria-label="${esc(US.name(k) + ', ' + fmt(e.date) + ', ' + kpDur(e) + (e.unsure ? ', nur wenn dein Kurs im Band ' + e.band + ' liegt' : ''))}"><b>${esc(US.short(e.k) || e.k)}</b><small>${e.lk ? 'LK' + (e.unsure ? '?' : '') + ' ' : ''}${e.dur ? e.dur + '′' : 'mdl.'}</small></button>`;
              })
              .join('');
            const ev = d.events.map((x) => `<small class=kp-ev title="${esc(x.long)}">${esc(x.ev)}</small>`).join('');
            return `<div class="kp-d${d.off ? ' off' : ''}${d.date === td ? ' today' : ''}"><i>${P(d.date).getDate()}</i>${d.off && !prevOff ? `<small class=kp-ol title="${esc(d.off)}">${esc(/ferien/i.test(d.off) ? 'Ferien' : d.off)}</small>` : ''}${ex}${ev}</div>`;
          })
          .join('');
      rows.push(`<div class="kp-wk${isCur ? ' cur' : ''}"><button type=button class="kp-kw${w.mon === wk ? ' on' : ''}" data-u=kpwk data-w=${w.mon} aria-label="KW ${kw(w.mon)} im Stundenplan zeigen"><b>${kw(w.mon)}</b></button>${cells}</div>`);
    }

    // Wie im Untis-Tab: „Als Nächstes“ als eigener Block über der Karte, in der Karte direkt der Kalender.
    // Darunter nur Hinweise, die gerade etwas erklären (keine Klausuren, „?“); Plan-Stand steht im Detail-Dialog.
    const top = `<div class=un-hh><h2>Klausuren</h2>${toggle}</div>`,
      next = nx
        ? `<button type=button class=un-nx data-u=kpx data-i=${kpList.indexOf(nx)} style="--h:${hue(kpKey(nx))}"><span class=dot></span><b>Als Nächstes</b><span class=nm>${esc(US.name(kpKey(nx)))}</span><small>${fmt(nx.date)} · ${kpIn(nx.date, td)}</small></button>`
        : '',
      count = nx
        ? ''
        : `<small class="d kp-nt">${noWritten ? `Im Abi-Rechner sind für ${sem} keine schriftlichen Fächer eingetragen. Trag deine Kurse dort ein (S oder LK), dann erscheinen hier deine Klausuren.` : kpList.length ? 'In diesem Halbjahr stehen keine Klausuren mehr an.' : 'Für deine Fächer stehen in diesem Plan keine Klausuren.'}</small>`,
      pastBtn = past.length ? `<button type=button class="lk kp-past" data-u=kppast aria-expanded="${kpPast}">${kpPast ? 'Vergangene Wochen ausblenden' : past.length + ' vergangene Woche' + (past.length === 1 ? '' : 'n') + ' zeigen'}</button>` : '',
      unsure = kpList.some((e) => e.unsure && e.date >= td)
        ? `<small class="d kp-nt"><b>?</b> = LK-Klausur nur, falls dein Kurs in diesem Band liegt.</small>`
        : '',
      grid = `<div class=kp><div class="kp-wk kp-hd"><span>KW</span>${WD.slice(0, 5).map((d) => `<span>${d}</span>`).join('')}</div>${rows.join('')}</div>`;
    // Ganz unten: eigene Klausuren in den eigenen Kalender (Apple, Google, Outlook) übernehmen
    const exp = upcoming.filter((e) => !e.unsure),
      skip = upcoming.length - exp.length,
      cal = `<div class=kp-cal><button type=button class="bt pr" data-u=kpics${exp.length ? '' : ' disabled'}>In meinen Kalender eintragen</button>${exp.length && skip ? `<small class=d>${skip} LK-Klausur${skip === 1 ? '' : 'en'} mit ? ${skip === 1 ? 'ist' : 'sind'} nicht dabei.</small>` : ''}</div>`;
    return `${next}<div class=g id=kp>${top}${pastBtn}${grid}${count}${unsure}${cal}</div>`;
  }

  function kpSheet(e) {
    const k = kpKey(e),
      d = dlg(),
      row = (a, b) => `<div class=un-li><span>${a}</span><b>${esc(b)}</b></div>`,
      dd = P(e.date);
    cur = null;
    d.className = 'un';
    d.innerHTML = `<h3 style="--h:${hue(k)}"><span class=dot></span>${esc(US.name(k))}</h3><div class=dbody><div class=un-info>${row('Datum', WDL[wdOf(e.date)] + ', ' + dd.getDate() + '. ' + MOL[dd.getMonth()] + ' ' + dd.getFullYear())}${row('Art', e.dur ? 'Klausur, ' + e.dur + ' Minuten' : 'Mündliche Prüfung')}${e.lk ? row('LK-Band', e.band + (e.unsure ? ' (nur, wenn dein Kurs dazugehört)' : '')) : ''}${KL.notes(e).map((n) => row('Hinweis', n)).join('')}${row('Woche', 'KW ' + kw(e.date) + (e.date >= U.util.today() ? ', ' + kpIn(e.date, U.util.today()) : ''))}</div><p class=d>Aus dem ${esc(KP.titel)} (Stand ${esc(KP.stand)}). Der Vertretungsplan in WebUntis hat Vorrang.</p></div><div class=bar><button type=button class=bt data-u=kpwk data-w=${U.util.mon(e.date)}>Woche im Stundenplan</button><button type=button class="bt pr" data-u=x>Schließen</button></div>`;
    if (!d.open) d.showModal();
  }
  // Kalenderdatei (.ics) mit den anstehenden eigenen Klausuren herunterladen (ohne unsichere LK-Klausuren)
  function kpIcs() {
    const td = U.util.today(),
      list = kpList.filter((e) => e.date >= td && !e.unsure);
    if (!list.length) return;
    const url = URL.createObjectURL(new Blob([KL.ics(list, (e) => US.name(kpKey(e)), new Date())], { type: 'text/calendar;charset=utf-8' })),
      a = document.createElement('a');
    a.href = url;
    a.download = 'Klausuren-' + kpStufe() + '-' + KP.von.slice(0, 4) + '-HJ' + KP.hj + '.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  // Woche oben im Stundenplan öffnen
  // Eigener Tab „Klausuren“
  function kpView() {
    const kp = kpData();
    return kp
      ? kpCard(U.util.today(), kp)
      : `<div class=g><h2>Klausuren</h2><p class=d>Für dieses Halbjahr ist noch kein Klausurplan hinterlegt.</p></div>`;
  }
  // Woche im Untis-Stundenplan öffnen (wechselt in den Untis-Tab)
  function kpWeek(w) {
    wk = w;
    tab = 'un';
    view = 'plan';
    msg = null;
    if (dlg().open) dlg().close();
    render();
    const el = $('#un-plan');
    if (el) el.scrollIntoView({ block: 'start' });
    else scrollTo(0, 0);
  }

  // ---------- Blätter (Dialog) ----------
  const dlg = () => $('#dlg');
  function findLesson(date, id, start) {
    const a = U.day(date, { merge: 10 });
    return a.find((x) => x.id === id) || a.find((x) => start && x.start <= start && x.end > start) || null;
  }
  function lessonInfo(l) {
    const row = (a, b) => (b ? `<div class=un-li><span>${a}</span><b>${esc(b)}</b></div>` : ''),
      sx = { cancelled: 'Entfällt', changed: 'Geändert (Vertretung oder Raumänderung)', exam: 'Klausur oder Prüfung' }[l.status];
    return `<div class=un-info>${row('Zeit', fmt(l.date) + ' · ' + l.start + '–' + l.end + (l.n > 1 ? ' (' + l.n + ' Stunden)' : ''))}${row('Raum', l.room)}${row('Lehrkraft', l.teacher)}${row('Kurs', l.subName && l.subName !== label(l) ? l.subName : '')}${row('Status', sx || '')}${row('Untis-Kennung', l.raw || (l.src === 'ms' ? '(vor dem Update abgeglichen)' : ''))}${l.note ? `<div class=un-note>${esc(l.note)}</div>` : ''}</div>`;
  }
  function sheet(k, ls) {
    cur = { k, ls };
    const d = dlg(),
      reg = subjects(),
      all = hws().filter((h) => key(h) === k),
      op = all.filter((h) => !h.done),
      dn = all.filter((h) => h.done),
      l = ls ? findLesson(ls.date, ls.id, ls.start) : null,
      old = d.querySelector('.dbody'),
      y = old ? old.scrollTop : 0,
      list = (a) => a.map((h) => hwItem(h, false)).join('');
    // Aus einer Stunde geöffnet: zuerst, was genau auf diese Stunde fällig ist, darunter die übrigen offenen
    let open_;
    if (l) {
      const mine = op.filter((h) => hwAt(hwLesson(h), l)),
        rest = op.filter((h) => !mine.includes(h));
      open_ = `<h4>Auf diese Stunde</h4>${mine.length ? list(mine) : '<p class=d>Keine Hausaufgaben auf diese Stunde.</p>'}${rest.length ? '<h4>Weitere offene</h4>' + list(rest) : ''}`;
    } else open_ = `<h4>Hausaufgaben</h4>${op.length ? list(op) : '<p class=d>Keine offenen Hausaufgaben.</p>'}`;
    d.className = 'un';
    d.innerHTML = `<h3 style="--h:${hue(k)}"><span class=dot></span>${esc(reg.get(k) || US.name(k))}</h3><div class=dbody>${l ? lessonInfo(l) : ''}${open_}${dn.length ? '<h4>Erledigt</h4>' + dn.map((h) => hwItem(h, false)).join('') : ''}</div><div class=bar><button type=button class=bt data-u=hwnew data-k="${esc(k)}">+ Hausaufgabe</button><button type=button class="bt pr" data-u=x>Schließen</button></div>`;
    if (!d.open) d.showModal();
    const nb = d.querySelector('.dbody');
    if (nb) nb.scrollTop = y;
  }
  // Nächste Stunde in diesem Fach nach heute laut Untis-Plan (für „fällig zur nächsten Stunde“), sonst null
  function nextLesson(k) {
    const td = U.util.today();
    for (let i = 1; i <= 56; i++) {
      const l = U.day(U.util.add(td, i)).find((x) => key(x) === k && x.status !== 'cancelled');
      if (l) return l;
    }
    return null;
  }
  // Fälligkeit im Formular: „Nächste Stunde“ (wenn Untis eine kennt) oder ein Datum
  function dueUi(mode) {
    const box = $('#udm');
    if (!box) return;
    if (mode) box.dataset.pick = mode; // eigene Wahl merken, auch über einen Fachwechsel ohne Stunde hinweg
    const l = nextLesson($('#ua').value),
      m = l ? box.dataset.pick || 'next' : 'date';
    box.dataset.m = m;
    box.querySelectorAll('button').forEach((b) => {
      const on = b.dataset.v === m;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
      if (b.dataset.v === 'next') b.disabled = !l;
    });
    $('#udn').textContent = l ? fmt(l.date) + ', ' + l.start + ' Uhr' : 'Keine Stunde in diesem Fach im Stundenplan gefunden.';
    $('#udn').hidden = m !== 'next' && !!l;
    $('#ud').hidden = m !== 'date';
    Motion.glide(box); // Umrandung zum gewählten Knopf wandern lassen
  }

  function addForm(k) {
    cur = null;
    const d = dlg(),
      reg = subjects(),
      rest = Object.entries(US.NAMES).filter(([id]) => id !== 'e9' && id !== 'stl' && !reg.has(id)),
      opt = (id, n) => `<option value="${esc(id)}"${id === k ? ' selected' : ''}>${esc(n)}</option>`;
    d.className = 'un';
    d.innerHTML = `<h3>Hausaufgabe eintragen</h3><div class=dbody><h4>Fach</h4><select id=ua>${reg.size ? `<optgroup label="Aus deinem Plan">${[...reg.entries()].map(([id, n]) => opt(id, n)).join('')}</optgroup>` : ''}<optgroup label="${reg.size ? 'Weitere Fächer' : 'Fächer'}">${rest.map(([id, n]) => opt(id, n)).join('')}</optgroup></select><h4>Aufgabe</h4><textarea id=ut rows=3 maxlength=500 placeholder="z. B. S. 45 Nr. 3"></textarea><h4>Fällig</h4><div class=un-tg role=group aria-label="Fälligkeit" id=udm><button type=button data-u=hwdue data-v=next>Nächste Stunde</button><button type=button data-u=hwdue data-v=date>Datum wählen</button></div><small class="d un-udn" id=udn></small><input type=date id=ud value="${U.util.add(U.util.today(), 1)}"></div><div class=bar><button type=button class=bt data-u=hwcancel data-k="${esc(k)}">Abbrechen</button><button type=button class="bt pr" data-u=hwsave>Speichern</button></div>`;
    if (!d.open) d.showModal();
    dueUi();
    $('#ut').focus();
  }
  function askPass() {
    const d = dlg(),
      c = U.configure();
    cur = null;
    d.className = 'un';
    d.innerHTML = `<h3>Mit Microsoft anmelden</h3><div class=dbody><p class=d>Untis hat dich abgemeldet. Microsoft-Passwort für <b>${esc(c.email)}</b>:</p><input type=password id=up autocomplete=current-password placeholder="Microsoft-Passwort"><label class=ir style="margin-top:10px;align-items:flex-start"><input type=checkbox id=up-rem style="width:auto;margin-top:3px"><span class=d>Passwort auf diesem Gerät merken</span></label></div><div class=bar><button type=button class=bt data-u=x>Abbrechen</button><button type=button class="bt pr" data-u=pwgo>Anmelden</button></div>`;
    if (!d.open) d.showModal();
    $('#up').focus();
  }

  // ---------- Verbindung und CSP ----------
  // CSP der Seite: erlaubt sie Verbindungen zu dieser Adresse? (connect-src 'none' sperrt alles)
  function cspAllows(url) {
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      return false;
    }
    const m = document.querySelector('meta[http-equiv="Content-Security-Policy"]'),
      dirs = (m ? m.content : '').split(';').map((x) => x.trim()),
      d = dirs.find((x) => /^connect-src\b/i.test(x)) || dirs.find((x) => /^default-src\b/i.test(x));
    if (!d) return true;
    return d
      .split(/\s+/)
      .slice(1)
      .some((s) => {
        s = s.toLowerCase();
        if (s === "'none'") return false;
        if (s === '*') return true;
        if (s === "'self'") return u.origin === location.origin;
        const h = s.replace(/^https:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
        if (/^[a-z]+:/.test(s) && !s.startsWith('https:')) return false;
        return h.startsWith('*.') ? u.hostname.endsWith(h.slice(1)) : u.hostname === h;
      });
  }
  const proxyUrl = (v) => String(v || '').trim().replace(/\/+$/, '');
  const cspHint = (p) => `Die Seite darf den Worker nicht aufrufen (Content-Security-Policy). In index.html muss bei connect-src stehen: ${p}`;
  const nerr = (code, m) => Object.assign(new Error(m), { code });

  // Erreichbarkeit und erlaubte Herkunft des Workers prüfen (Route /ping des Workers)
  async function pcheck(raw) {
    const base = proxyUrl(raw),
      o = location.origin;
    if (o === 'null' || location.protocol === 'file:') return ['err', 'Die Seite läuft als lokale Datei. Der Worker lässt nur Aufrufe von der GitHub-Pages-Adresse zu (oder von localhost, wenn du es in OK_ORIGINS einträgst).'];
    if (!cspAllows(base)) return ['err', cspHint(base)];
    let r;
    try {
      r = await fetch(base + '/ping', { credentials: 'omit', cache: 'no-store' });
    } catch (e) {
      return ['err', `Keine Antwort. Mögliche Ursachen: Adresse falsch, Worker nicht deployt, oder ${o} fehlt in OK_ORIGINS des Workers (dort darf nur die Adresse ohne Pfad stehen).`];
    }
    const tx = (await r.text().catch(() => '')).trim();
    if (r.ok && tx === 'ok') return ['ok', `Der Worker ist erreichbar und lässt diese Seite (${o}) zu.`];
    if (r.status === 400 && tx === 'bad host') return ['warn', `Der Worker ist erreichbar und lässt diese Seite (${o}) zu. Er ist aber noch eine ältere Version ohne /ping. Für den Abgleich reicht das, mit der neuen worker/untis-worker.js bekommst du bessere Fehlermeldungen.`];
    if (r.status === 403) return ['err', `Der Worker lehnt diese Seite ab. Trag ${o} in OK_ORIGINS ein.`];
    return ['err', `Unerwartete Antwort vom Worker (Status ${r.status}). Ist die Adresse wirklich dein Untis-Worker?`];
  }

  // ---------- Abgleich ----------
  // Kalender-Link (Untis → Profil → Freigaben → Kalender publizieren) → Adresse über den Worker
  function icalCheck(link) {
    const c = U.configure();
    let u;
    try {
      u = new URL(String(link).trim().replace(/^webcal:/i, 'https:'));
    } catch (e) {
      return { err: 'Das ist kein Link. Kopiere ihn aus Untis (Profil → Freigaben → Kalender publizieren).' };
    }
    if (u.protocol !== 'https:' || u.hostname !== c.server) return { err: `Der Link muss von ${c.server} stammen.` };
    if (!/^\/WebUntis\//i.test(u.pathname)) return { err: 'Das sieht nicht nach einem Untis-Kalenderlink aus (Pfad /WebUntis/…).' };
    return { url: proxyUrl(c.proxy) + '/' + u.hostname + u.pathname + u.search };
  }
  async function syncIcal(link) {
    const x = icalCheck(link);
    if (x.err) throw nerr('ICS', x.err);
    let r;
    try {
      r = await fetch(x.url, { credentials: 'omit', cache: 'no-store' });
    } catch (e) {
      throw nerr('NET', 'Keine Verbindung zum Worker. Internet, Worker-Adresse und Freigabe (CSP, OK_ORIGINS) prüfen.');
    }
    if (!r.ok) throw nerr('HTTP', 'Untis oder der Worker antwortet mit Fehler ' + r.status + '. Ist der Kalender in Untis noch veröffentlicht?');
    const text = await r.text();
    if (!/BEGIN:VCALENDAR/.test(text)) throw nerr('ICS', 'Der Link liefert keinen Kalender. Veröffentliche den Kalender in Untis neu und kopiere den neuen Link.');
    return U.importIcs(text);
  }
  const mcfg = () => {
    const c = U.configure();
    return { proxy: proxyUrl(c.proxy), server: c.server, school: c.school, user: ux().mUser, key: keyGet() };
  };
  async function syncHomework() {
    const t = U.util.today(),
      r = await UM.homework(mcfg(), U.util.add(t, -14), U.util.add(t, 60));
    U.ingest({ homework: r.homework }, { src: 'mobile' });
    return r;
  }

  function paintBusy() {
    const b = uiBusy || U.status().busy;
    document.querySelectorAll('[data-u=sync],[data-u=dosync],[data-u=login]').forEach((x) => {
      x.disabled = b;
      if (b) x.dataset.busy = '1';
      else delete x.dataset.busy;
    });
  }
  // Andere Wege: Kalender-Link (Stundenplan) und/oder Untis-Mobile-Schlüssel (Hausaufgaben)
  const altOk = () => {
    const x = ux();
    return !!(x.ical || (x.mUser && keyGet()));
  };
  const msOn = () => !!U.configure().email;
  // Hauptweg: Microsoft-Anmeldung über den Worker. Das Passwort wird nur gebraucht, wenn Untis keine Sitzung mehr hat.
  // Klappt das nicht (oder ist keine E-Mail eingetragen), laufen die anderen Wege, sofern eingerichtet.
  async function doSync(o) {
    o = o || {};
    if (uiBusy || U.status().busy) return;
    const c = U.configure(),
      x = ux(),
      good = [],
      bad = [];
    let ask = false;
    msg = null;
    if (!msOn() && !altOk()) {
      view = 'setup';
      msg = { c: 'warn', t: 'Trag zuerst deine Microsoft-E-Mail ein.' };
      return redraw();
    }
    if (!cspAllows(proxyUrl(c.proxy))) {
      msg = { c: 'err', t: cspHint(proxyUrl(c.proxy)) };
      return redraw();
    }
    uiBusy = true;
    paintBusy();
    const run = async (name, f) => {
      try {
        const r = await f();
        good.push(name + ': ' + r.t);
        if (r.w) bad.push(name + ': ' + r.w);
        return true;
      } catch (e) {
        if (e && e.code === 'NEED_LOGIN' && !o.pass) ask = true;
        else bad.push(name + ': ' + ((e && e.message) || 'Fehler'));
        if (e && e.code === 'AUTH') pwSet(''); // falsches gespeichertes Passwort nicht weiter benutzen
        return false;
      }
    };
    let ok = false;
    if (msOn()) {
      ok = await run('Untis', async () => {
        const r = await U.sync({ provider: 'ms', pass: o.pass || pwGet() || undefined });
        if (o.pass && o.rem) pwSet(o.pass);
        pw = '';
        return { t: `${r.lessons} Stunden, ${r.homework} Hausaufgaben`, w: r.warn.join(' ') };
      });
    }
    if (!ok && !ask) {
      if (x.ical) await run('Stundenplan (Kalender-Link)', async () => ({ t: (await syncIcal(x.ical)) + ' Stunden' }));
      if (x.mUser && keyGet()) {
        await run('Hausaufgaben (Untis Mobile)', async () => {
          const r = await syncHomework();
          return { t: String(r.homework.filter(vis).length), w: r.warn.join(' ') }; // ohne Überfälliges, wie in der Anzeige
        });
      }
    }
    uiBusy = false;
    paintBusy();
    if (o.silent) {
      // Automatischer Abgleich: kein Passwort-Fenster und keine Erfolgsmeldung, nur Probleme melden
      if (ask && !good.length) msg = { c: 'warn', t: 'Untis hat dich abgemeldet. Tippe auf ↻, um dich neu anzumelden.' };
      else if (bad.length) msg = { c: good.length ? 'warn' : 'err', t: [...good, ...bad].join(' · ') };
      if (view === 'plan') redraw(); // die Einrichten-Seite nicht neu zeichnen, sonst gehen Eingaben verloren
      return;
    }
    if (ask && !good.length) {
      msg = null;
      return askPass();
    }
    msg = bad.length ? { c: good.length ? 'warn' : 'err', t: [...good, ...bad].join(' · ') } : { c: 'ok', t: good.join(' · ') + ' abgeglichen.' };
    redraw();
  }
  // Beim Öffnen der Seite (und wenn sie nach längerer Zeit wieder in den Vordergrund kommt) still abgleichen,
  // mit der gespeicherten Untis-Sitzung bzw. dem gemerkten Passwort
  const AUTO_AGAIN = 15 * 60 * 1000;
  function autoSync() {
    if (!(msOn() || altOk()) || uiBusy || U.status().busy) return;
    doSync({ silent: true });
  }
  addEventListener('load', autoSync);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - (U.status().lastSync || 0) > AUTO_AGAIN) autoSync();
  });
  function quick() {
    if (msOn() || altOk()) return doSync();
    view = 'setup';
    msg = { c: 'warn', t: 'Trag zuerst deine Microsoft-E-Mail und dein Passwort ein.' };
    redraw();
  }
  const redraw = () => {
    if (active() && !dlg().open) render();
  };

  // Schlüssel aus dem Eingabefeld übernehmen: reiner Schlüssel oder der ganze untis://-Link
  function saveKey(v) {
    v = String(v || '').trim();
    const q = UM.parseQr(v),
      k = q ? q.key : v.replace(/[\s-]/g, '').toUpperCase();
    if (!k) return null;
    UM.b32(k); // wirft, wenn der Schlüssel nicht gültig aussieht
    keySet(k);
    if (q && q.user) uxSet({ mUser: q.user });
    return { user: q && q.user };
  }

  // ---------- Einrichten ----------
  function setup() {
    const c = U.configure(),
      s = U.status(),
      x = ux(),
      hasKey = !!keyGet(),
      rem = !!pwGet(),
      um = U.unmapped(),
      names = [...new Set([...um, ...Object.keys(c.subjectMap)])].sort((a, b) => a.localeCompare(b, 'de')),
      busy = uiBusy || s.busy,
      ic = x.ical ? icalCheck(x.ical) : null,
      m = msg ? `<div class="un-msg ${msg.c}" role=status id=us-msg><span>${esc(msg.t)}</span></div>` : '<div id=us-msg></div>',
      groups = [...new Set(US.choices().map((q) => q[2]))],
      selOpts = (cu) => `<option value="">nicht zugeordnet</option>${groups.map((g) => `<optgroup label="${esc(g)}">${US.choices().filter((q) => q[2] === g).map(([id, n]) => `<option value="${esc(id)}"${cu === id ? ' selected' : ''}>${esc(n)}</option>`).join('')}</optgroup>`).join('')}`;
    return `<div class=g><div class=un-nav><button type=button class=bt data-u=plan>‹ Plan</button><div class=wk><b>Untis einrichten</b></div></div>${m}</div>
<div class=g><h2>Mit Microsoft anmelden</h2><p class=d>Gib deine Schul-E-Mail und dein Microsoft-Passwort ein, so wie beim Knopf <i>Office 365</i> auf der Untis-Seite. Mehr ist nicht nötig: Untis von Gaesdonck ist schon eingestellt.</p>
<h4>E-Mail</h4><input type=email id=us-em data-uf=email value="${esc(c.email)}" placeholder="vorname.nachname@…" autocomplete=username autocapitalize=off spellcheck=false>
<h4>Passwort</h4><input type=password id=us-pw data-uf=pw value="${esc(pw)}" placeholder="${rem ? 'gespeichert' : 'Microsoft-Passwort'}" autocomplete=current-password>
<label class=ir style="margin-top:10px;align-items:flex-start"><input type=checkbox id=us-rem ${rem ? 'checked' : ''} style="width:auto;margin-top:3px"><span class=d>Passwort auf diesem Gerät merken. Dann gleicht die App ohne Nachfrage ab. Sonst fragt sie nur, wenn Untis dich abgemeldet hat.</span></label>
<div class=bar style="justify-content:flex-start;flex-wrap:wrap"><button type=button class="bt pr" data-u=login${busy ? ' data-busy=1 disabled' : ''}>Anmelden und abgleichen</button>${s.connected || rem ? '<button type=button class=bt data-u=logout>Abmelden</button>' : ''}</div>
<small class=d>${s.connected ? 'Angemeldet' + (s.who ? ' als ' + esc(s.who) : '') + '. ' : ''}Das Passwort geht nur über den Worker der App an Microsoft, wird dort nicht gespeichert und landet nie in der Sicherungsdatei. Lieber ohne Microsoft-Passwort? Das geht mit deinem Untis-Benutzer und dem Untis-Mobile-Schlüssel unter <i>Andere Wege</i> weiter unten. <button type=button class=lk data-a=dsg>Datenschutz</button></small></div>
<div class=g><h2>Fächer zuordnen</h2><p class=d>Die App erkennt Kürzel wie <i>D G1</i>, <i>E5 L1</i> oder <i>PKKU</i> selbst: Grundkurse eines Fachs gehören zusammen, Leistungskurse sind eigene Gruppen. ${names.length ? 'Nicht erkannte Namen kannst du hier von Hand zuordnen.' : 'Im Moment ist alles erkannt.'}</p>${names.map((n) => `<div class=ir><span class=un-map>${esc(n)}</span><select data-uf=map data-n="${esc(n)}" aria-label="Fach für ${esc(n)}">${selOpts(own(c.subjectMap, n) ? c.subjectMap[n] : '')}</select></div>`).join('')}</div>
<div class=g><h2>Daten</h2><p class=d>${s.lessons} Stunden und ${hws().length} Hausaufgaben gespeichert${s.lastSync ? ', Stand ' + stamp(s.lastSync) : ''}. Sie sind Teil der Sicherungsdatei im Menü (ohne Zugangsdaten).</p><div class=bar style="justify-content:flex-start"><button type=button class=bt data-u=rmdata style="color:var(--no)">Alle Untis-Daten löschen</button></div></div>
<div class=g><details><summary>Andere Wege (ohne Microsoft-Passwort)</summary>
<p class=d>Wenn du dein Microsoft-Passwort nicht eingeben möchtest oder dein Konto eine zweite Bestätigung (MFA) verlangt. Diese Wege laufen nur, wenn keine E-Mail eingetragen ist oder die Microsoft-Anmeldung nicht klappt. Wer nur sie nutzen will, lässt die E-Mail oben leer.</p>
<h4>Stundenplan: Kalender-Link</h4><p class=d>In Untis <i>Profil → Freigaben → Kalender publizieren</i>, den Link kopieren und hier einfügen.</p>
<input type=url id=us-ical data-uf=ical placeholder="https://gaesdonck.webuntis.com/WebUntis/…" value="${esc(x.ical)}" autocomplete=off autocapitalize=off>
<small id=us-ical-info class="d${ic && ic.err ? ' bad' : ''}">${ic ? (ic.err ? esc(ic.err) : 'Link erkannt.') : 'Der Link ist wie ein Passwort für deinen Stundenplan: nicht weitergeben.'}</small>
<h4>Hausaufgaben: Untis-Mobile-Schlüssel</h4><p class=d>In Untis <i>Profil → Freigaben → Zugriff über Untis Mobile → QR-Code anzeigen</i>, die Felder <i>Benutzer</i> und <i>Schlüssel</i> eintragen.</p>
<input id=us-mu data-uf=muser value="${esc(x.mUser)}" placeholder="Benutzer" autocomplete=off autocapitalize=off>
<input type=password id=us-mk data-uf=mkey placeholder="${hasKey ? 'Schlüssel gespeichert, zum Ersetzen neu eingeben' : 'Schlüssel'}" autocomplete=off autocapitalize=off style="margin-top:8px">
<small id=us-mk-info class=d>${hasKey ? 'Schlüssel ist auf diesem Gerät gespeichert. ' : ''}Er bleibt nur auf diesem Gerät (nicht in der Sicherungsdatei); an Untis geht nur ein Einmalcode.</small>
<div class=bar style="justify-content:flex-start;flex-wrap:wrap"><button type=button class=bt data-u=mtest>Schlüssel testen</button>${hasKey ? '<button type=button class=bt data-u=mkeyrm>Schlüssel entfernen</button>' : ''}<button type=button class=bt data-u=dosync${busy ? ' data-busy=1 disabled' : ''}>Abgleichen</button></div>
<h4>ICS-Datei</h4><p class=d>Nur Stundenplan, einmalig. Die Datei wird nur in deinem Browser gelesen.</p><div class=bar style="justify-content:flex-start"><button type=button class=bt data-u=ics>ICS-Datei wählen</button></div>
<h4>Verbindung</h4><p class=d>Prüft, ob der Worker erreichbar ist und diese Seite (${esc(location.origin)}) zulässt.</p><div class=bar style="justify-content:flex-start"><button type=button class=bt data-u=ptest>Verbindung prüfen</button></div>
</details></div>`;
  }

  // ---------- Ereignisse ----------
  const go = (v) => {
    view = v;
    msg = null;
    render();
    scrollTo(0, 0);
  };
  const say = (c, t) => {
    msg = { c, t };
    const b = $('#us-msg');
    if (b) {
      b.className = 'un-msg ' + c;
      b.textContent = t;
    }
  };
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-u]');
    if (!t || t.disabled) return;
    const a = t.dataset.u,
      d = t.dataset;
    if (a == 'abi') {
      tab = lastTab;
      render();
    } else if (a == 'un' || a == 'kpt') {
      if (!mine(tab)) lastTab = tab;
      tab = a == 'un' ? 'un' : 'kp';
      view = 'plan';
      msg = null;
      render();
      scrollTo(0, 0);
    } else if (a == 'prev' || a == 'next') {
      wk = U.util.add(wk, a == 'prev' ? -7 : 7);
      render();
    } else if (a == 'today') {
      wk = homeWeek();
      render();
    } else if (a.slice(0, 2) == 'nt') UP.act(a); // Erinnerungen (untis-push.js)
    else if (a == 'setup') go('setup');
    else if (a == 'plan') go('plan');
    else if (a == 'mx') {
      msg = null;
      render();
    } else if (a == 'sync') quick();
    else if (a == 'dosync') doSync();
    else if (a == 'login') {
      const em = $('#us-em'),
        pi = $('#us-pw'),
        rm = $('#us-rem');
      if (em) U.configure({ email: em.value });
      if (pi) pw = pi.value;
      if (!U.configure().email) return say('warn', 'Trag zuerst deine Schul-E-Mail ein.');
      if (!pw && !pwGet()) return say('warn', 'Gib zuerst dein Microsoft-Passwort ein.');
      if (pw) U.logout().then(() => doSync({ pass: pw, rem: !!(rm && rm.checked) })); // neues Passwort: frisch anmelden
      else doSync();
    } else if (a == 'logout') {
      pwSet('');
      pw = '';
      U.logout().then(render);
    } else if (a == 'ptest') {
      say('', 'Prüfe …');
      pcheck(U.configure().proxy).then(([c, tx]) => say(c, tx));
    } else if (a == 'mtest') {
      const kv = $('#us-mk'),
        mu = $('#us-mu');
      try {
        if (kv && kv.value.trim()) {
          const r = saveKey(kv.value);
          kv.value = '';
          if (r && r.user && mu) mu.value = r.user;
        }
      } catch (x) {
        return say('err', x.message);
      }
      if (mu) uxSet({ mUser: mu.value.trim() });
      const c = mcfg();
      if (!c.key) return say('warn', 'Trag zuerst den Schlüssel ein.');
      if (!c.user) return say('warn', 'Trag zuerst den Benutzer ein.');
      if (!cspAllows(c.proxy)) return say('err', cspHint(c.proxy));
      say('', 'Prüfe Anmeldung …');
      UM.test(c).then(
        (r) => say('ok', 'Anmeldung klappt' + (r.name ? ' (' + r.name + ')' : '') + '. Jetzt kannst du abgleichen.'),
        (er) => say('err', (er && er.message) || 'Die Anmeldung ist fehlgeschlagen.'),
      );
    } else if (a == 'mkeyrm') {
      keySet('');
      render();
    } else if (a == 'ics') $('#uf').click();
    else if (a == 'kpx') {
      const x = kpList[+d.i];
      if (x) kpSheet(x);
    } else if (a == 'kpwk') kpWeek(d.w);
    else if (a == 'kpics') kpIcs();
    else if (a == 'kpst') {
      uxSet({ stufe: d.v });
      render();
    } else if (a == 'kppast') {
      kpPast = !kpPast;
      render();
    } else if (a == 'ls') sheet(d.k, { date: d.d, id: d.id, start: d.s });
    else if (a == 'sub') sheet(d.k);
    else if (a == 'chk') {
      const h = hws().find((x) => x.id === d.id);
      if (h) U.setDone(d.id, !h.done);
    } else if (a == 'hwall') {
      hwAll = d.v == '1';
      render();
    } else if (a == 'hwnew') addForm(d.k || '');
    else if (a == 'hwcancel') {
      if (d.k) sheet(d.k);
      else dlg().close();
    } else if (a == 'hwsave') {
      const k = $('#ua').value,
        text = $('#ut').value.trim(),
        nl = $('#udm').dataset.m === 'next' ? nextLesson(k) : null,
        due = nl ? nl.date : $('#ud').value,
        nm = US.name(k);
      if (!text) {
        $('#ut').focus();
        return;
      }
      U.hwAdd(nm !== k ? { sub: k, subName: nm, text, due } : { sub: '', subName: k, text, due });
      sheet(k);
    } else if (a == 'hwdue') dueUi(d.v);
    else if (a == 'hwdel') {
      if (confirm('Diese Hausaufgabe löschen?')) U.hwRemove(d.id);
    } else if (a == 'pwgo') {
      const v = $('#up').value,
        r = $('#up-rem');
      if (!v) return $('#up').focus();
      dlg().close();
      doSync({ pass: v, rem: !!(r && r.checked) });
    } else if (a == 'x') dlg().close();
    else if (a == 'rmdata' && confirm('Stundenplan, Hausaufgaben, Kalender-Link und Schlüssel auf diesem Gerät löschen? Erinnerungen werden ausgeschaltet.')) {
      U.reset();
      wipe();
      defaults();
      pw = '';
      msg = null;
      render();
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.dataset && e.target.dataset.uf == 'pw') pw = e.target.value;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key == 'Enter' && e.target.id == 'us-pw') {
      e.preventDefault();
      const b = document.querySelector('[data-u=login]');
      if (b) b.click();
    } else if (e.key == 'Enter' && e.target.id == 'up') {
      e.preventDefault();
      const b = document.querySelector('[data-u=pwgo]');
      if (b) b.click();
    }
  });
  document.addEventListener('change', (e) => {
    const t = e.target,
      f = t.dataset && t.dataset.uf;
    if (t.id == 'us-rem' && !t.checked) pwSet(''); // Häkchen weg: gespeichertes Passwort sofort löschen
    if (t.id == 'ua') dueUi(); // anderes Fach: nächste Stunde neu suchen
    if (t.id == 'uf' && t.files && t.files[0]) {
      const r = new FileReader();
      t.value = '';
      r.onload = () => {
        try {
          const n = U.importIcs(r.result);
          msg = { c: 'ok', t: n + ' Stunden aus der Datei übernommen.' };
        } catch (x) {
          msg = { c: 'err', t: x.message || 'Die Datei konnte nicht gelesen werden.' };
        }
        redraw();
      };
      r.onerror = () => {
        msg = { c: 'err', t: 'Die Datei konnte nicht gelesen werden.' };
        redraw();
      };
      r.readAsText(t.files[0]);
      return;
    }
    if (!f || f == 'pw') return;
    if (f.slice(0, 2) == 'nt') return UP.set(f, t.value); // Erinnerungen: Tage vorher, Uhrzeit
    if (f == 'ical') {
      const v = t.value.trim();
      uxSet({ ical: v });
      const i = v ? icalCheck(v) : null,
        el = $('#us-ical-info');
      el.textContent = i ? (i.err ? i.err : 'Link erkannt.') : 'Der Link ist wie ein Passwort für deinen Stundenplan: nicht weitergeben.';
      el.classList.toggle('bad', !!(i && i.err));
    } else if (f == 'muser') uxSet({ mUser: t.value.trim() });
    else if (f == 'mkey') {
      const el = $('#us-mk-info');
      try {
        const r = saveKey(t.value);
        if (!r) return;
        if (r.user) $('#us-mu').value = r.user;
        t.value = '';
        t.placeholder = 'gespeichert, zum Ersetzen neu eingeben';
        el.textContent = 'Schlüssel gespeichert' + (r.user ? ' (Benutzer übernommen)' : '') + '. Er bleibt nur auf diesem Gerät.';
        el.classList.remove('bad');
      } catch (x) {
        el.textContent = x.message;
        el.classList.add('bad');
      }
    } else if (f == 'email') U.configure({ email: t.value });
    else if (f == 'map') {
      const m = Object.assign({}, U.configure().subjectMap);
      if (t.value) m[t.dataset.n] = t.value;
      else delete m[t.dataset.n];
      U.configure({ subjectMap: m });
    }
  });

  // Daten haben sich geändert: Plan oder geöffnetes Blatt neu zeichnen (die Einrichten-Seite nicht, sonst gehen Eingaben verloren)
  U.on('change', () => {
    if (!active()) return;
    if (dlg().open) {
      if (cur) sheet(cur.k, cur.ls);
    } else if (view == 'plan') render();
  });
  U.on('status', paintBusy);
  // Nach dem Schließen eines Blatts den Plan auffrischen und den Zustand zurücksetzen
  dlg().addEventListener('close', () => {
    cur = null;
    if (active() && view == 'plan') render();
  });

  // key: welche Ansicht gerade gezeigt wird (für motion.js: neue Ansicht = Kästen zoomen auf)
  return { head, view: view_, key: () => (tab === 'kp' ? 'kp' : 'un:' + view), wipe, defaults, FROM, TO };
})();
