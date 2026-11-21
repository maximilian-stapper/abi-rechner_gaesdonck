/* =============================================================================
 * untis-ui.js – Oberfläche für den Untis-Planer (Stundenplan + Hausaufgaben)
 *
 * Nutzt untis.js (Untis) sowie $, esc, NM, S, st, tab aus den anderen Dateien.
 * Eingebunden in index.html nach untis.js, vor views.js. views.js ruft head() und view() auf.
 * Alle Aktionen laufen über data-u="…" (getrennt von data-a/-e/-t/-c in events.js).
 *
 * WICHTIG: Fachnamen, Lehrer, Räume und Hausaufgabentexte sind Fremdtext.
 *          Sie gehen im HTML IMMER durch esc(), nie roh in innerHTML.
 * ========================================================================== */
const UntisUI = (() => {
  'use strict';
  const U = Untis;

  // Zeitrahmen des Plans: nur dieser Bereich wird gezeigt (Termine außerhalb werden gekürzt oder ausgeblendet)
  const FROM = '07:55',
    TO = '18:30',
    PX = 0.9; // Pixel pro Minute

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
    own = (o, k) => Object.prototype.hasOwnProperty.call(o, k),
    nmOf = (k) => (own(NM, k) ? NM[k] : '');

  // ---------- Fächer: Schlüssel, Name, Kürzel, Farbe ----------
  const key = (x) => x.sub || x.subName || '?',
    label = (x) => (x.sub && nmOf(x.sub)) || x.subLong || x.subName || 'Sonstige',
    SH = new Map(
      Object.entries({
        de: 'Deu', en: 'Eng', fr: 'Fra', la: 'Lat', es: 'Spa', e9: 'Spa', ku: 'Kun', mu: 'Mus', li: 'Lit', ek: 'Ek',
        ge: 'Ges', sw: 'SoWi', re: 'Rel', sp: 'Spo', ma: 'Mat', bi: 'Bio', ch: 'Che', ph: 'Phy', if: 'Inf',
      }),
    ),
    short = (l) => SH.get(l.sub) || String(l.subName || '?').split(/[\s\-_./\d]/)[0].slice(0, 5) || '?',
    HU = new Map(
      Object.entries({
        de: 345, en: 25, fr: 200, la: 45, es: 325, e9: 325, ku: 285, mu: 305, li: 262, ek: 150, ge: 75, sw: 100,
        re: 238, sp: 175, ma: 215, bi: 125, ch: 165, ph: 190, if: 8,
      }),
    ),
    hue = (k) => {
      if (HU.has(k)) return HU.get(k);
      let h = 7;
      for (const c of String(k)) h = (h * 31 + c.charCodeAt(0)) % 360;
      return h;
    };

  // Alle Fächer, die im Plan oder bei den Hausaufgaben vorkommen: Map Schlüssel → Name
  function subjects() {
    const m = new Map(),
      add = (x) => {
        const k = key(x);
        if (!m.has(k)) m.set(k, label(x));
      },
      td = U.util.today();
    U.range(U.util.add(td, -14), U.util.add(td, 63)).forEach(add);
    U.homework().forEach(add);
    return m;
  }

  // ---------- Zustand der Oberfläche ----------
  // Wochenende: gleich die kommende Woche zeigen
  const homeWeek = () => {
    const t = U.util.today(),
      m = U.util.mon(t);
    return wdOf(t) >= 5 ? U.util.add(m, 7) : m;
  };
  let view = 'plan', // 'plan' | 'setup'
    wk = homeWeek(),
    hwAll = false,
    pw = '', // Passwort nur im Speicher, nie gespeichert
    msg = null, // { c: 'ok'|'warn'|'err', t }
    lastTab = 'ov',
    cur = null; // geöffnetes Fach-Blatt { k, ls }

  const active = () => tab === 'un' && !!st;

  // ---------- Kopfzeile: Umschalter Abi-Rechner | Untis ----------
  const head = (t) =>
    `<div class=seg role=group aria-label="Bereich"><button type=button data-u=abi aria-pressed="${t !== 'un'}" class="${t !== 'un' ? 'on' : ''}">Abi-Rechner</button><button type=button data-u=un aria-pressed="${t === 'un'}" class="${t === 'un' ? 'on' : ''}">Untis</button></div>`;

  const view_ = () => (view === 'setup' ? setup() : plan());

  // ---------- Hausaufgaben ----------
  function due(h) {
    const t = U.util.today();
    if (!h.due) return { t: 'ohne Datum', c: '' };
    if (h.due === t) return { t: 'heute fällig', c: 'now' };
    if (h.due === U.util.add(t, 1)) return { t: 'morgen fällig', c: 'soon' };
    if (h.due < t) return { t: 'überfällig seit ' + fmt(h.due), c: 'late' };
    return { t: 'fällig ' + fmt(h.due), c: '' };
  }
  // lnk = true: Zeile in der Übersicht (Tippen öffnet das Fach), sonst im Fach-Blatt
  function hwItem(h, lnk, reg) {
    const k = key(h),
      d = due(h),
      body = `${lnk ? `<div class=sn>${esc(reg.get(k) || label(h))}</div>` : ''}<div class=t>${esc(h.text || '(ohne Text)')}</div>${h.remark ? `<div class=r>${esc(h.remark)}</div>` : ''}<small class="due ${d.c}">${esc(d.t)}${h.teacher ? ' · ' + esc(h.teacher) : ''}${h.src === 'manual' ? ' · selbst eingetragen' : ''}</small>`;
    return `<div class="un-hw${h.done ? ' dn' : ''}" style="--h:${hue(k)}"><button type=button class=uchk data-u=chk data-id="${esc(h.id)}" aria-pressed="${!!h.done}" aria-label="${h.done ? 'Als offen markieren' : 'Als erledigt markieren'}"></button>${lnk ? `<button type=button class=un-hb data-u=sub data-k="${esc(k)}">${body}</button>` : `<div class=un-hb>${body}</div>`}${!lnk && h.src === 'manual' ? `<button type=button class=ux data-u=hwdel data-id="${esc(h.id)}" aria-label="Hausaufgabe löschen">✕</button>` : ''}</div>`;
  }

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
  const STX = { cancelled: 'entfällt', changed: 'geändert', exam: 'Klausur' };

  function grid(w, open) {
    const td = U.util.today(),
      H = Math.round((T - F) * PX),
      y = (m) => Math.round((m - F) * PX),
      cols = w.days.length;
    let hidden = 0;
    const hl = [];
    for (let h = Math.ceil(F / 60); h * 60 <= T; h++) hl.push(h);
    const axis = hl.map((h) => `<i style="top:${y(h * 60)}px">${h}:00</i>`).join(''),
      lines = hl.map((h) => `<i class=hl style="top:${y(h * 60)}px"></i>`).join(''),
      heads = w.days
        .map((d) => `<div class="un-dh${d.date === td ? ' today' : ''}"><b>${WD[d.wd]}</b><small>${P(d.date).getDate()}.</small></div>`)
        .join(''),
      now = new Date(),
      nowM = now.getHours() * 60 + now.getMinutes(),
      colsHtml = w.days
        .map((d) => {
          const items = [];
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
                cnt = open.get(k) || 0,
                sx = STX[l.status] || '';
              return `<button type=button class="un-ls${l.status === 'cancelled' ? ' x' : l.status === 'changed' ? ' c' : l.status === 'exam' ? ' e' : ''}" data-u=ls data-k="${esc(k)}" data-d="${d.date}" data-id="${esc(l.id)}" data-s="${l.start}" style="--h:${hue(k)};top:${y(s) + 1}px;height:${h}px;left:calc(${(lane / n) * 100}% + 1px);width:calc(${100 / n}% - 2px)" aria-label="${esc(label(l) + ', ' + l.start + ' bis ' + l.end + (sx ? ', ' + sx : '') + (cnt ? ', ' + cnt + ' offene Hausaufgaben' : ''))}"><b>${esc(short(l))}</b>${h >= 30 && l.room ? `<small>${esc(l.room)}</small>` : ''}${cnt ? `<span class=un-bg>${cnt}</span>` : ''}</button>`;
            })
            .join('');
          const line = d.date === td && nowM >= F && nowM <= T ? `<i class=un-now style="top:${y(nowM)}px"></i>` : '';
          return `<div class="un-col${d.date === td ? ' today' : ''}" style="height:${H}px">${lines}${blocks}${line}</div>`;
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
      hw = U.homework(),
      open = new Map(),
      reg = subjects(),
      has = s.lessons > 0 || s.homework > 0,
      weekLessons = w.days.reduce((n, d) => n + d.lessons.length, 0);
    hw.filter((h) => !h.done).forEach((h) => open.set(key(h), (open.get(key(h)) || 0) + 1));

    const banner = msg
      ? `<div class="un-msg ${msg.c}" role=status><span>${esc(msg.t)}</span><button type=button class=ux data-u=mx aria-label="Meldung schließen">✕</button></div>`
      : '';

    // Noch nichts eingerichtet
    const first = !has
      ? `<div class=g><h2>Stundenplan und Hausaufgaben</h2><p class=d>Hier erscheinen deine Fächer bunt im Wochenplan, und mit einem Tipp auf ein Fach siehst du die Hausaufgaben. Hole die Daten per Live-Abruf aus WebUntis oder per ICS-Datei.</p><div class=bar style="justify-content:flex-start"><button type=button class="bt pr" data-u=setup>Untis einrichten</button></div></div>`
      : '';

    // Als Nächstes
    const nx = has ? U.next() : null,
      nxt = nx
        ? `<button type=button class=un-nx data-u=ls data-k="${esc(key(nx))}" data-d="${nx.date}" data-id="${esc(nx.id)}" data-s="${nx.start}" style="--h:${hue(key(nx))}"><span class=dot></span><b>${nx.running ? 'Jetzt' : 'Als Nächstes'}</b><span class=nm>${esc(label(nx))}</span><small>${nx.date === td ? '' : fmt(nx.date) + ' '}${nx.start}${nx.room ? ' · ' + esc(nx.room) : ''}</small></button>`
        : '';

    // Wochenplan
    let g = '',
      note = '';
    if (has) {
      const r = grid(w, open);
      g = weekLessons ? r.html : `<p class=d style="padding:14px 4px">In dieser Woche sind keine Stunden gespeichert${s.range && s.range[0] ? ` (letzter Abgleich: ${fmt(s.range[0])} bis ${fmt(s.range[1])})` : ''}.</p>`;
      if (r.hidden) note += `<small class="d un-nt">${r.hidden} Termin${r.hidden == 1 ? '' : 'e'} außerhalb von ${FROM} bis ${TO} ${r.hidden == 1 ? 'wird' : 'werden'} nicht angezeigt.</small>`;
    }
    const um = U.unmapped();
    if (um.length) note += `<small class="d un-nt">${um.length} Fach${um.length == 1 ? '' : 'e'} noch nicht zugeordnet: ${um.slice(0, 4).map(esc).join(', ')}${um.length > 4 ? ' …' : ''} <button type=button class=lk data-u=setup>Zuordnen</button></small>`;

    const wlabel = (() => {
      const a = P(w.from),
        b = P(U.util.add(w.from, 4));
      return a.getMonth() === b.getMonth() ? `${a.getDate()}.–${b.getDate()}. ${MO[b.getMonth()]}` : `${a.getDate()}. ${MO[a.getMonth()]} – ${b.getDate()}. ${MO[b.getMonth()]}`;
    })();

    const planCard = has
      ? `<div class=g><div class=un-nav><button type=button class=ib data-u=prev aria-label="Vorige Woche">‹</button><div class=wk><b>KW ${kw(w.from)}</b><small>${wlabel}</small></div><button type=button class=ib data-u=next aria-label="Nächste Woche">›</button><button type=button class=bt data-u=today${w.from === homeWeek() ? ' disabled' : ''}>Heute</button></div>${g}<div class=un-foot>${note}<small class=d>${s.lastSync ? 'Stand: ' + stamp(s.lastSync) + ' · ' : ''}${s.lessons} Stunden</small><span class=sp></span><button type=button class=lk data-u=sync ${s.busy ? 'data-busy=1 disabled' : ''}>Abgleichen</button><button type=button class=lk data-u=setup>Einrichten</button></div></div>`
      : '';

    // Hausaufgaben
    const list = (hwAll ? hw : hw.filter((h) => !h.done)),
      chips = [...reg.entries()]
        .sort((a, b) => a[1].localeCompare(b[1], 'de'))
        .map(([k, n]) => `<button type=button class=un-chip data-u=sub data-k="${esc(k)}" style="--h:${hue(k)}">${esc(n)}${open.get(k) ? `<em>${open.get(k)}</em>` : ''}</button>`)
        .join('');
    const hwCard = `<div class=g><div class=un-hh><h2>Hausaufgaben</h2><div class=un-tg role=group aria-label="Anzeige"><button type=button data-u=hwall data-v=0 aria-pressed="${!hwAll}" class="${!hwAll ? 'on' : ''}">Offen</button><button type=button data-u=hwall data-v=1 aria-pressed="${hwAll}" class="${hwAll ? 'on' : ''}">Alle</button></div></div>${chips ? `<div class=un-chips>${chips}</div>` : ''}${list.length ? list.map((h) => hwItem(h, true, reg)).join('') : `<p class=d style="margin:10px 0">${hwAll ? 'Noch keine Hausaufgaben.' : 'Keine offenen Hausaufgaben.'}</p>`}<div class=bar style="justify-content:flex-start"><button type=button class=bt data-u=hwnew data-k="">+ Hausaufgabe</button></div></div>`;

    return banner + first + nxt + planCard + hwCard + `<small class=d>Stundenplan und Hausaufgaben liegen nur in diesem Browser. Fremde Angaben (Räume, Lehrkräfte, Aufgaben) stammen aus Untis und sind ohne Gewähr.</small>`;
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
    return `<div class=un-info>${row('Zeit', fmt(l.date) + ' · ' + l.start + '–' + l.end + (l.n > 1 ? ' (' + l.n + ' Stunden)' : ''))}${row('Raum', l.room)}${row('Lehrkraft', l.teacher)}${row('Kurs', l.subName && l.subName !== label(l) ? l.subName : '')}${row('Status', sx || '')}${l.note ? `<div class=un-note>${esc(l.note)}</div>` : ''}</div>`;
  }
  function sheet(k, ls) {
    cur = { k, ls };
    const d = dlg(),
      reg = subjects(),
      all = U.homework().filter((h) => key(h) === k),
      op = all.filter((h) => !h.done),
      dn = all.filter((h) => h.done),
      l = ls ? findLesson(ls.date, ls.id, ls.start) : null,
      old = d.querySelector('.dbody'),
      y = old ? old.scrollTop : 0;
    d.className = 'un';
    d.innerHTML = `<h3 style="--h:${hue(k)}"><span class=dot></span>${esc(reg.get(k) || nmOf(k) || k)}</h3><div class=dbody>${l ? lessonInfo(l) : ''}<h4>Hausaufgaben</h4>${op.length ? op.map((h) => hwItem(h, false)).join('') : '<p class=d>Keine offenen Hausaufgaben.</p>'}${dn.length ? '<h4>Erledigt</h4>' + dn.map((h) => hwItem(h, false)).join('') : ''}</div><div class=bar><button type=button class=bt data-u=hwnew data-k="${esc(k)}">+ Hausaufgabe</button><button type=button class="bt pr" data-u=x>Schließen</button></div>`;
    if (!d.open) d.showModal();
    const nb = d.querySelector('.dbody');
    if (nb) nb.scrollTop = y;
  }
  function addForm(k) {
    cur = null;
    const d = dlg(),
      reg = subjects(),
      rest = S.filter(([id]) => !reg.has(id)),
      opt = (id, n) => `<option value="${esc(id)}"${id === k ? ' selected' : ''}>${esc(n)}</option>`;
    d.className = 'un';
    d.innerHTML = `<h3>Hausaufgabe eintragen</h3><div class=dbody><h4>Fach</h4><select id=ua>${reg.size ? `<optgroup label="Aus deinem Plan">${[...reg.entries()].map(([id, n]) => opt(id, n)).join('')}</optgroup>` : ''}<optgroup label="${reg.size ? 'Weitere Fächer' : 'Fächer'}">${rest.map(([id, n]) => opt(id, n)).join('')}</optgroup></select><h4>Aufgabe</h4><textarea id=ut rows=3 maxlength=500 placeholder="z. B. S. 45 Nr. 3"></textarea><h4>Fällig am</h4><input type=date id=ud value="${U.util.add(U.util.today(), 1)}"></div><div class=bar><button type=button class=bt data-u=hwcancel data-k="${esc(k)}">Abbrechen</button><button type=button class="bt pr" data-u=hwsave>Speichern</button></div>`;
    if (!d.open) d.showModal();
    $('#ut').focus();
  }
  function askPass() {
    const d = dlg(),
      c = U.configure();
    cur = null;
    d.className = 'un';
    d.innerHTML = `<h3>Bei Untis anmelden</h3><div class=dbody><p class=d>Passwort für <b>${esc(c.user)}</b>. Es wird nicht gespeichert und nur für diese Anmeldung gebraucht.</p><input type=password id=up autocomplete=current-password placeholder="Passwort"></div><div class=bar><button type=button class=bt data-u=x>Abbrechen</button><button type=button class="bt pr" data-u=pwgo>Abgleichen</button></div>`;
    if (!d.open) d.showModal();
    $('#up').focus();
  }

  // ---------- Abgleich ----------
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
  const cspHint = (p) => `Die Seite darf diese Adresse nicht aufrufen (Content-Security-Policy). Ändere in index.html bei connect-src 'none' auf: connect-src ${p}`;

  function paintBusy() {
    const b = U.status().busy;
    document.querySelectorAll('[data-u=sync],[data-u=dosync]').forEach((x) => {
      x.disabled = b;
      if (b) x.dataset.busy = '1';
      else delete x.dataset.busy;
    });
  }
  async function doSync(pass) {
    if (U.status().busy) return;
    const c = U.configure();
    msg = null;
    if (c.proxy && !cspAllows(proxyUrl(c.proxy))) {
      msg = { c: 'err', t: cspHint(proxyUrl(c.proxy)) };
      return redraw();
    }
    paintBusy();
    let again = false;
    try {
      const r = await U.sync({ pass });
      pw = '';
      msg = { c: r.warn.length ? 'warn' : 'ok', t: `${r.lessons} Stunden und ${r.homework} Hausaufgaben abgeglichen.${r.warn.length ? ' ' + r.warn.join(' ') : ''}` };
    } catch (e) {
      msg = { c: 'err', t: (e && e.message) || 'Der Abgleich ist fehlgeschlagen.' };
      if (e && e.code === 'NEED_LOGIN' && c.user && view === 'plan') again = true;
      if (e && e.code === 'AUTH') pw = '';
    }
    paintBusy();
    if (again) {
      msg = null;
      return askPass();
    }
    redraw();
  }
  function quick() {
    const c = U.configure();
    if (!c.proxy || !c.server || !c.school || !c.user) {
      view = 'setup';
      msg = { c: 'warn', t: 'Trag zuerst Adresse, Schule, Benutzername und Proxy ein.' };
      return redraw();
    }
    if (U.status().connected) doSync();
    else askPass();
  }
  const redraw = () => {
    if (active() && !dlg().open) render();
  };

  // Erreichbarkeit und erlaubte Herkunft des Workers prüfen (Route /ping des Workers)
  async function pcheck(raw) {
    const base = proxyUrl(raw),
      o = location.origin;
    if (!base) return ['err', 'Trag zuerst die Proxy-Adresse ein.'];
    if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(base)) return ['err', 'Die Adresse muss mit https:// beginnen und darf keinen Pfad haben, zum Beispiel https://untis.meinname.workers.dev'];
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

  // ---------- Einrichten ----------
  function setup() {
    const c = U.configure(),
      s = U.status(),
      um = U.unmapped(),
      names = [...new Set([...um, ...Object.keys(c.subjectMap)])].sort((a, b) => a.localeCompare(b, 'de')),
      o = location.origin,
      gh = /\.github\.io$/i.test(location.hostname),
      p = proxyUrl(c.proxy),
      pOk = !p || cspAllows(p),
      url = c.server ? `https://${c.server}/WebUntis/?school=${c.school}` : '',
      m = msg ? `<div class="un-msg ${msg.c}" role=status id=us-msg><span>${esc(msg.t)}</span></div>` : '<div id=us-msg></div>';
    return `<div class=g><div class=un-nav><button type=button class=bt data-u=plan>‹ Plan</button><div class=wk><b>Untis einrichten</b></div></div>${m}</div>
<div class=g><h2>Live-Abruf</h2><p class=d>Holt Stundenplan und Hausaufgaben direkt aus WebUntis, über deinen eigenen Cloudflare-Worker. Das Passwort wird nie gespeichert.</p>
<h4>WebUntis-Adresse (aus der Browser-Leiste kopieren)</h4><input type=url id=us-url data-uf=url placeholder="https://xyz.webuntis.com/WebUntis/?school=…" value="${esc(url)}" autocomplete=off autocapitalize=off>
<small id=us-info class=d>${c.server ? 'Server: ' + esc(c.server) : 'Noch keine Adresse.'}</small>
<h4>Schulname (Wert hinter school=)</h4><input id=us-sch data-uf=school value="${esc(c.school)}" autocomplete=off autocapitalize=off>
<h4>Benutzername</h4><input id=us-usr data-uf=user value="${esc(c.user)}" autocomplete=username autocapitalize=off>
<h4>Passwort (nur für diesen Abgleich)</h4><input type=password id=us-pw data-uf=pw value="${esc(pw)}" autocomplete=current-password>
<h4>Proxy-Adresse (dein Worker)</h4><input type=url id=us-px data-uf=proxy placeholder="https://untis.meinname.workers.dev" value="${esc(c.proxy)}" autocomplete=off autocapitalize=off>
<small class=d>Diese Seite: ${esc(o)}${gh ? ' (GitHub Pages)' : ''}. Genau diese Adresse (ohne Pfad) muss im Worker bei OK_ORIGINS stehen.</small>
<small id=us-csp class="d bad" style="display:block;margin-top:4px">${pOk ? '' : esc(cspHint(p))}</small>
<h4>Wochen im Voraus</h4><select data-uf=weeks>${[1, 2, 3, 4, 6, 8].map((n) => `<option value="${n}"${c.weeks == n ? ' selected' : ''}>${n}</option>`).join('')}</select>
<div class=bar style="justify-content:flex-start;flex-wrap:wrap"><button type=button class=bt data-u=ptest>Proxy prüfen</button><button type=button class="bt pr" data-u=dosync${s.busy ? ' data-busy=1 disabled' : ''}>Jetzt abgleichen</button>${s.connected ? '<button type=button class=bt data-u=logout>Abmelden</button>' : ''}</div>
<details><summary>So richtest du den Worker ein</summary><ol class=un-steps><li>Bei Cloudflare ein kostenloses Konto anlegen, dann <i>Workers &amp; Pages → Create → Worker</i>.</li><li>Den Inhalt von <code>worker/untis-worker.js</code> einfügen. Bei <code>OK_ORIGINS</code> muss <code>${esc(o)}</code> stehen. Deployen.</li><li>Die Worker-Adresse oben eintragen und auf <i>Proxy prüfen</i> tippen.</li><li>In <code>index.html</code> beim Content-Security-Policy-Tag <code>connect-src 'none'</code> durch <code id=us-cs>connect-src ${esc(p || 'https://DEIN-WORKER.workers.dev')}</code> ersetzen und die Datei hochladen.</li></ol><small class=d>Der Worker läuft bei Cloudflare, nicht auf GitHub Pages. GitHub Pages liefert nur die Seite aus, der Browser ruft den Worker von dort aus auf. Der Worker sieht dein Untis-Passwort beim Anmelden: nur den eigenen verwenden und die Adresse nicht weitergeben.</small></details></div>
<div class=g><h2>Oder: ICS-Datei</h2><p class=d>Ohne Worker und ohne Änderung am CSP. Importiert nur den Stundenplan, keine Hausaufgaben (die trägst du selbst ein). Die Datei wird nur in deinem Browser gelesen.</p><div class=bar style="justify-content:flex-start"><button type=button class=bt data-u=ics>ICS-Datei wählen</button></div></div>
${
  names.length
    ? `<div class=g><h2>Fächer zuordnen</h2><p class=d>Untis-Namen, die der Rechner nicht erkennt. Mit der Zuordnung bekommt ein Fach seine feste Farbe, und Stunden und Hausaufgaben gehören zusammen.</p>${names.map((n) => `<div class=ir><span class=un-map>${esc(n)}</span><select data-uf=map data-n="${esc(n)}" aria-label="Fach für ${esc(n)}"><option value="">nicht zugeordnet</option>${S.map(([id, name]) => `<option value="${id}"${c.subjectMap[n] === id ? ' selected' : ''}>${esc(name)}</option>`).join('')}</select></div>`).join('')}</div>`
    : ''
}
<div class=g><h2>Daten</h2><p class=d>${s.lessons} Stunden und ${s.homework} Hausaufgaben gespeichert${s.lastSync ? ', Stand ' + stamp(s.lastSync) : ''}. Sie sind Teil der Sicherungsdatei im Menü (ohne Benutzername und Passwort).</p><div class=bar style="justify-content:flex-start"><button type=button class=bt data-u=rmdata style="color:var(--no)">Alle Untis-Daten löschen</button></div></div>`;
  }

  // ---------- Ereignisse ----------
  const go = (v) => {
    view = v;
    msg = null;
    render();
    scrollTo(0, 0);
  };
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-u]');
    if (!t || t.disabled) return;
    const a = t.dataset.u,
      d = t.dataset;
    if (a == 'abi') {
      tab = lastTab;
      render();
    } else if (a == 'un') {
      if (tab !== 'un') lastTab = tab;
      tab = 'un';
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
    } else if (a == 'setup') go('setup');
    else if (a == 'plan') go('plan');
    else if (a == 'mx') {
      msg = null;
      render();
    } else if (a == 'sync') quick();
    else if (a == 'dosync') {
      const i = $('#us-pw');
      if (i) pw = i.value;
      doSync(pw);
    } else if (a == 'logout') U.logout().then(render);
    else if (a == 'ptest') {
      const box = $('#us-msg'),
        i = $('#us-px');
      if (i) U.configure({ proxy: i.value });
      box.className = 'un-msg';
      box.textContent = 'Prüfe …';
      pcheck(i ? i.value : U.configure().proxy).then(([c, tx]) => {
        msg = { c, t: tx };
        const b = $('#us-msg');
        if (b) {
          b.className = 'un-msg ' + c;
          b.textContent = tx;
        }
      });
    } else if (a == 'ics') $('#uf').click();
    else if (a == 'ls') sheet(d.k, { date: d.d, id: d.id, start: d.s });
    else if (a == 'sub') sheet(d.k);
    else if (a == 'chk') {
      const h = U.homework().find((x) => x.id === d.id);
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
        due = $('#ud').value;
      if (!text) {
        $('#ut').focus();
        return;
      }
      U.hwAdd(own(NM, k) ? { sub: k, text, due } : { sub: '', subName: k, text, due });
      sheet(k);
    } else if (a == 'hwdel') {
      if (confirm('Diese Hausaufgabe löschen?')) U.hwRemove(d.id);
    } else if (a == 'pwgo') {
      const v = $('#up').value;
      if (!v) return $('#up').focus();
      dlg().close();
      doSync(v);
    } else if (a == 'x') dlg().close();
    else if (a == 'rmdata' && confirm('Stundenplan, Hausaufgaben und Untis-Einstellungen auf diesem Gerät löschen?')) {
      U.reset();
      pw = '';
      msg = null;
      render();
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.dataset && e.target.dataset.uf == 'pw') pw = e.target.value;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key == 'Enter' && e.target.id == 'up') {
      e.preventDefault();
      const b = document.querySelector('[data-u=pwgo]');
      if (b) b.click();
    }
  });
  document.addEventListener('change', (e) => {
    const t = e.target,
      f = t.dataset && t.dataset.uf;
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
    if (f == 'url') {
      let v = t.value.trim();
      if (v && !/^[a-z]+:\/\//i.test(v)) v = 'https://' + v;
      U.configure({ url: v });
      const c = U.configure();
      $('#us-sch').value = c.school;
      $('#us-info').textContent = c.server ? 'Server: ' + c.server : 'Die Adresse wurde nicht erkannt.';
    } else if (f == 'school') U.configure({ school: t.value.trim() });
    else if (f == 'user') U.configure({ user: t.value.trim() });
    else if (f == 'proxy') {
      U.configure({ proxy: t.value });
      const p = proxyUrl(t.value);
      $('#us-csp').textContent = p && !cspAllows(p) ? cspHint(p) : '';
      $('#us-cs').textContent = 'connect-src ' + (p || 'https://DEIN-WORKER.workers.dev');
    } else if (f == 'weeks') U.configure({ weeks: +t.value || 4 });
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

  return { head, view: view_, FROM, TO };
})();
