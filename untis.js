/* =============================================================================
 * untis.js – Untis-Anbindung für den Abi-Rechner (Stundenplan + Hausaufgaben)
 *
 * Nur Logik, kein HTML/CSS. Klassisches Script wie die anderen Dateien:
 *   index.html:  <script src="untis.js"></script>   (nach state.js, vor views.js)
 * Braucht nur K aus constants.js (eigener Speicher-Key K + '.untis'); NM wird
 * für Fachnamen genutzt, falls vorhanden. Kein Zugriff auf st / render().
 *
 * ZWEI WEGE, AN DIE DATEN ZU KOMMEN
 *   A) ICS-Import (ohne CSP-Änderung, passt zur „alles bleibt im Browser“-Idee):
 *        Untis.importIcs(text)             nur Stundenplan, keine Hausaufgaben
 *   B) Live-Abruf über den Worker (worker/untis-worker.js), Stundenplan + Hausaufgaben:
 *        Untis.configure({ email })                 einmalig (Server, Schule, Worker stehen fest in FIX)
 *        await Untis.sync({ pass })                 Microsoft-Anmeldung über den Worker, nur wenn
 *                                                   keine gültige Sitzung da ist. Passwort wird hier NIE gespeichert.
 *   Dazu: Untis.hwAdd({...}) für selbst eingetragene Hausaufgaben und
 *   Untis.ingest({lessons, homework}) als freie Schnittstelle für eigene Quellen.
 *
 * SCHNITTSTELLEN (alles synchron, außer sync/logout)
 *   Konfiguration  configure(p) · status() · on(evt, fn) → off()
 *                  Events: 'change' (Daten neu), 'status' (busy/Fehler)
 *   Abgleich       sync({pass, from, to}) → {lessons, homework, warn[]} · logout()
 *                  Fehler tragen e.code: NEED_LOGIN AUTH NO_RIGHT NET HTTP API CONFIG
 *   Import         importIcs(text) · ingest(data, {from, to, src}) · use(name, provider)
 *   Stundenplan    day(iso, {merge}) · week(iso, {merge}) · range(from, to) ·
 *                  slots(week) · next(now)
 *   Hausaufgaben   homework({open, sub, from, to}) · homeworkBySubject(o) ·
 *                  setDone(id, bool) · hwAdd(o) · hwRemove(id)
 *   Fächer         mapSubject(name, langname) · unmapped() · setResolver(fn)
 *                  (Untis-Name → Schlüssel aus S/NM; setResolver schaltet eine genauere Erkennung davor,
 *                   siehe untis-subjects.js)
 *   Daten          backup() · restore(obj) · reset()
 *   Hilfen         util.{iso, add, mon, today} · hooks.{lesson, homework, ics} · debug
 *
 * Lesson   { id, date:'2026-11-23', start:'08:00', end:'08:45', sub:'ma', subName:'M-GK1',
 *            subLong:'Mathematik', teacher, room, cls, status:'ok'|'cancelled'|'changed'|'exam',
 *            note, src }              (nach merge: zusätzlich n = Anzahl Stunden)
 * Homework { id, sub, subName, text, remark, date, due, teacher, done, src }
 *
 * WICHTIG: text, note, remark, teacher … sind Fremdtext (Lehrer schreiben das).
 *          Im HTML IMMER esc(...) benutzen, nie roh in innerHTML.
 *
 * BEISPIEL-ANBINDUNG (events.js / views.js):
 *   Untis.on('change', () => tab === 'un' && render());
 *   a == 'us'  →  Untis.sync({ pass: $('#up').value }).catch((e) => alert(e.message));
 *   #uf change →  r.onload = () => Untis.importIcs(r.result); r.readAsText(file);
 *   Backup     →  JSON.stringify({ ...st, untis: Untis.backup() })   /   Untis.restore(s.untis)
 *   „Alles löschen“ (rs) → zusätzlich Untis.reset()
 *   View       →  Untis.week(datum).days.forEach((d) => d.lessons.forEach(...))
 * ========================================================================== */
const Untis = (() => {
  'use strict';
  const KEY = (typeof K !== 'undefined' ? K : 'abirechner') + '.untis';
  // Wir haben nur eine Schule: Server, Schule und Worker stehen fest und sind nicht einstellbar
  const FIX = {
    server: 'gaesdonck.webuntis.com',
    school: 'gaesdonck',
    proxy: 'https://untis-worker.maximilian-stapper.workers.dev',
  };

  // ---------- Datum/Zeit: immer lokale Zeit, 'YYYY-MM-DD' und 'HH:MM' ----------
  const pad = (n) => String(n).padStart(2, '0'),
    iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()),
    par = (s) => {
      const [y, m, d] = s.split('-');
      return new Date(+y, m - 1, +d);
    },
    add = (s, n) => {
      const d = par(s);
      d.setDate(d.getDate() + n);
      return iso(d);
    },
    mon = (s) => {
      const d = par(s);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return iso(d);
    },
    today = () => iso(new Date()),
    mm = (t) => +t.slice(0, 2) * 60 + +t.slice(3),
    // Untis liefert Zahlen: 20261123 und 745 (= 07:45)
    d8 = (n) => (n ? String(n).slice(0, 4) + '-' + String(n).slice(4, 6) + '-' + String(n).slice(6, 8) : ''),
    t4 = (n) => {
      n = String(n).padStart(4, '0');
      return n.slice(0, 2) + ':' + n.slice(2);
    },
    n8 = (s) => +s.replace(/-/g, ''),
    err = (code, msg) => Object.assign(new Error(msg), { code });

  // ---------- Zustand (localStorage, getrennt von st) ----------
  const blank = () => ({
    v: 1,
    cfg: Object.assign({ provider: 'ms', user: '', email: '', subjectMap: {}, weeks: 4, keepDays: 14 }, FIX),
    days: {}, // { 'YYYY-MM-DD': [Lesson] }
    hw: [], // [Homework]
    done: {}, // { homeworkId: true/false } – lokal gesetzter Erledigt-Status
    sync: null, // { at, from, to, src }
  });
  const fill = (s) => {
    const x = Object.assign(blank(), s, { cfg: Object.assign(blank().cfg, s.cfg, FIX) });
    if (x.cfg.provider === 'rpc' && !x.cfg.user) x.cfg.provider = 'ms'; // ältere Speicherstände
    return x;
  };
  let D = (() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.v === 1) return fill(s);
    } catch (e) {}
    return blank();
  })();
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(D));
    } catch (e) {}
  };

  const L = {};
  const emit = (ev, x) => (L[ev] || []).forEach((f) => { try { f(x); } catch (e) { console.error(e); } });
  const on = (ev, f) => {
    (L[ev] = L[ev] || []).push(f);
    return () => { L[ev] = L[ev].filter((g) => g !== f); };
  };
  const H = { lesson: null, homework: null, ics: null }; // Feintuning-Hooks (siehe unten)
  let busy = false, lastErr = null;

  // ---------- Fächer: Untis-Name/Kürzel → Schlüssel aus constants.js (S/NM) ----------
  // Kürzel sind je Schule verschieden. Mehrdeutiges (z. B. 'Sp' = Sport ODER Spanisch,
  // Spanisch ab EF 'es' oder ab Kl. 9 'e9') bleibt bewusst offen: configure({ subjectMap: { 'Sp': 'sp' } }).
  const DEF = Object.assign(
    Object.fromEntries('de en fr la es ku mu li ek ge sw re ma bi ch ph if'.split(' ').map((k) => [k, k])),
    { d: 'de', deutsch: 'de', e: 'en', englisch: 'en', f: 'fr', franz: 'fr', französisch: 'fr', l: 'la', latein: 'la',
      spanisch: 'es', m: 'ma', mathe: 'ma', mathematik: 'ma', bio: 'bi', biologie: 'bi', chemie: 'ch', physik: 'ph',
      info: 'if', informatik: 'if', kunst: 'ku', musik: 'mu', lit: 'li', literatur: 'li', erdkunde: 'ek', geo: 'ek',
      geographie: 'ek', gesch: 'ge', geschichte: 'ge', sowi: 'sw', sozialwissenschaften: 'sw', kr: 're', kath: 're',
      religion: 're', sport: 'sp' },
  );
  // 'D-GK1', 'M LK2', 'Bio 3' → 'd', 'm', 'bio'
  const base = (s) => String(s).toLowerCase().replace(/\(.*?\)/g, '').trim().split(/[\s\-_./\d]/)[0];
  // Optionale Zusatz-Erkennung (z. B. UntisSubjects.resolve): (Kürzel, Langname) → Schlüssel oder ''.
  // Eigene Zuordnungen (subjectMap) gehen vor, die Standardregeln unten greifen nur, wenn sie nichts findet.
  let resolver = null;
  const sub = (raw, long) => {
    raw = String(raw || '').trim() || String(long || '').trim();
    if (!raw) return '';
    const lo = raw.toLowerCase(), b = base(raw), m = D.cfg.subjectMap;
    const k = Object.keys(m).find((x) => x.toLowerCase() === lo || x.toLowerCase() === b);
    if (k) return m[k];
    if (resolver) {
      try {
        const r = resolver(raw, long);
        if (r) return r;
      } catch (e) {}
    }
    if (DEF[lo] || DEF[b]) return DEF[lo] || DEF[b];
    if (typeof NM !== 'undefined') {
      const e = Object.entries(NM).find(([, n]) => n.toLowerCase().replace(/\(.*?\)/g, '').trim() === lo);
      if (e) return e[0];
    }
    return '';
  };
  const remap = () => {
    Object.values(D.days).forEach((a) => a.forEach((l) => (l.sub = sub(l.subName, l.subLong))));
    D.hw.forEach((h) => h.src !== 'manual' && (h.sub = sub(h.subName)));
  };
  const unmapped = () => {
    const s = new Set();
    Object.values(D.days).forEach((a) => a.forEach((l) => !l.sub && l.subName && s.add(l.subName)));
    D.hw.forEach((h) => !h.sub && h.subName && s.add(h.subName));
    return [...s].sort();
  };

  // ---------- Normalformen ----------
  const mkLesson = (o) => {
    const l = Object.assign(
      { id: '', date: '', start: '', end: '', subName: '', subLong: '', teacher: '', room: '', cls: '', status: 'ok', note: '', src: 'ext' },
      o,
    );
    if (l.sub == null) l.sub = sub(l.subName, l.subLong);
    if (!l.id) l.id = l.src + '|' + l.date + '|' + l.start + '|' + l.subName;
    return l;
  };
  const mkHw = (o) => {
    const h = Object.assign(
      { id: '', subName: '', text: '', remark: '', date: '', due: '', teacher: '', done: false, src: 'ext' },
      o,
    );
    if (h.sub == null) h.sub = sub(h.subName);
    if (!h.id) h.id = h.src + '|' + h.due + '|' + h.subName + '|' + h.text.slice(0, 24);
    return h;
  };
  const hook = (f, raw, x) => {
    const r = f ? f(raw, x) : x;
    return r === false ? null : r || x;
  };

  // ---------- Zusammenführen ----------
  const clean = (a) => {
    const seen = new Set();
    return a
      .filter((l) => !seen.has(l.id) && seen.add(l.id))
      .sort((x, y) => x.start.localeCompare(y.start) || x.end.localeCompare(y.end) || x.subName.localeCompare(y.subName));
  };
  function ingest(x, o) {
    o = o || {};
    const src = o.src || 'ext';
    if (x.lessons) {
      const les = x.lessons.map(mkLesson).map((l) => Object.assign(l, { src: l.src === 'ext' ? src : l.src }));
      if (o.from && o.to) for (const d of Object.keys(D.days)) if (d >= o.from && d <= o.to) delete D.days[d];
      for (const l of les) (D.days[l.date] = D.days[l.date] || []).push(l);
      for (const d of Object.keys(D.days)) D.days[d] = clean(D.days[d]);
    }
    if (x.homework) {
      // Quelle ersetzen, selbst eingetragene (manual) bleiben immer stehen
      const hw = x.homework.map(mkHw).map((h) => Object.assign(h, { src: h.src === 'ext' ? src : h.src }));
      D.hw = D.hw.filter((h) => h.src === 'manual' || h.src !== src).concat(hw);
      const seen = new Set();
      D.hw = D.hw.filter((h) => !seen.has(h.id) && seen.add(h.id));
    }
    D.sync = { at: Date.now(), from: o.from || null, to: o.to || null, src };
    prune();
    save();
    emit('change');
    return { lessons: x.lessons ? x.lessons.length : 0, homework: x.homework ? x.homework.length : 0 };
  }
  function prune() {
    const a = add(today(), -D.cfg.keepDays), b = add(today(), -60);
    for (const d of Object.keys(D.days)) if (d < a) delete D.days[d];
    D.hw = D.hw.filter((h) => (h.due || h.date || '9') >= b);
  }

  // ---------- Quelle B: WebUntis über Proxy (inoffizielle Schnittstellen!) ----------
  // Aus dem Browser nicht direkt möglich (CORS, Cookie-Header) → untis-worker.js als Proxy.
  // Alle Pfade/Feldnamen stehen hier gebündelt, falls Untis bei deiner Schule abweicht.
  const MSG = {
    '-8504': 'Benutzername oder Passwort falsch.',
    '-8520': 'Sitzung abgelaufen – bitte neu anmelden.',
    '-8509': 'Dieses Untis-Konto darf den Stundenplan nicht abrufen.',
  };
  // Cookies der Untis-Sitzung + angemeldete Person. Nur in sessionStorage (weg, sobald der Tab geschlossen wird).
  const SKEY = KEY + '.sess';
  let jar = {}, pers = null;
  try {
    const x = JSON.parse(sessionStorage.getItem(SKEY));
    if (x && x.jar) (jar = x.jar), (pers = x.pers || null);
  } catch (e) {}
  const keep = () => {
    try {
      if (jar.JSESSIONID) sessionStorage.setItem(SKEY, JSON.stringify({ jar, pers }));
      else sessionStorage.removeItem(SKEY);
    } catch (e) {}
  };
  const jarStr = () => Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
  const jarSet = (s) =>
    s.split(/;\s*/).forEach((c) => {
      const i = c.indexOf('=');
      if (i > 0) jar[c.slice(0, i)] = c.slice(i + 1);
    });
  const root = (c) => c.proxy.replace(/\/+$/, '') + '/' + c.server + '/WebUntis';

  async function http(c, path, body, o) {
    o = o || {};
    const h = {};
    if (body) h['Content-Type'] = 'application/json';
    if (Object.keys(jar).length) h['X-Untis-Cookie'] = jarStr();
    if (o.tok) h.Authorization = 'Bearer ' + o.tok;
    let r;
    try {
      r = await fetch(root(c) + path, {
        method: body ? 'POST' : 'GET',
        headers: h,
        credentials: 'omit',
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw err('NET', 'Keine Verbindung zum Untis-Proxy. Internet, Proxy-URL und connect-src im CSP prüfen.');
    }
    const ck = r.headers.get('X-Untis-Cookie');
    if (ck) jarSet(ck);
    if (!r.ok) throw err(r.status === 401 || r.status === 403 || (r.status >= 300 && r.status < 400) ? 'NEED_LOGIN' : 'HTTP', 'Untis/Proxy antwortete mit Status ' + r.status + '.');
    try {
      return o.raw ? await r.text() : await r.json();
    } catch (e) {
      throw err('API', 'Unerwartete Antwort von Untis (kein JSON).');
    }
  }
  async function rpc(c, method, params) {
    const r = await http(c, '/jsonrpc.do?school=' + encodeURIComponent(c.school), { id: 'abi', jsonrpc: '2.0', method, params });
    if (r.error) {
      const k = r.error.code;
      throw err(k === -8520 ? 'NEED_LOGIN' : k === -8504 ? 'AUTH' : k === -8509 ? 'NO_RIGHT' : 'API', MSG[k] || 'Untis: ' + r.error.message);
    }
    return r.result;
  }
  async function login(c, pass) {
    if (!c.user || !pass) throw err('NEED_LOGIN', 'Untis-Benutzername und Passwort nötig.');
    jar = {};
    const r = await rpc(c, 'authenticate', { user: c.user, password: pass, client: 'abi-rechner' });
    pers = { type: r.personType, id: r.personId };
    keep();
  }

  // ---------- Microsoft-Anmeldung (der Worker spielt den Office-365-Login nach) ----------
  async function msLogin(c, email, pass) {
    if (!email || !pass) throw err('NEED_LOGIN', 'Microsoft-E-Mail und Passwort nötig.');
    let r;
    try {
      r = await fetch(c.proxy.replace(/\/+$/, '') + '/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
        body: JSON.stringify({ email, password: pass }),
      });
    } catch (e) {
      throw err('NET', 'Keine Verbindung zum Worker. Bitte Internetverbindung prüfen.');
    }
    let j = null;
    try {
      j = await r.json();
    } catch (e) {}
    if (!j) throw err('OLD_WORKER', 'Der Worker kennt die Microsoft-Anmeldung noch nicht (Status ' + r.status + '). Bitte worker/untis-worker.js bei Cloudflare neu deployen.');
    if (!r.ok || !j.ok) throw err(j.code === 'AUTH' ? 'AUTH' : j.code || 'LOGIN', j.message || 'Die Anmeldung ist fehlgeschlagen.');
    jar = {};
    pers = null;
    jarSet(r.headers.get('X-Untis-Cookie') || '');
    if (!jar.JSESSIONID) throw err('LOGIN', 'Der Worker hat keine Untis-Sitzung zurückgegeben.');
    keep();
  }
  // Kurzlebiges Token der Sitzung; scheitert es, ist die Sitzung abgelaufen
  async function token(c) {
    let t = '';
    try {
      t = String(await http(c, '/api/token/new', null, { raw: true })).trim();
    } catch (e) {
      if (e.code === 'NET') throw e;
    }
    if (!/^[\w-]+\.[\w-]+\.[\w-]*$/.test(t)) throw err('NEED_LOGIN', 'Untis hat dich abgemeldet. Bitte neu anmelden.');
    return t;
  }
  async function who(c, t) {
    const r = await http(c, '/api/rest/view/v1/app/data', null, { tok: t }),
      u = (r && r.user) || {},
      p = u.person || {},
      roles = (u.roles || []).map(String);
    if (!p.id) throw err('API', 'Untis liefert keine Personen-Kennung.');
    pers = { id: p.id, type: roles.includes('TEACHER') && !roles.includes('STUDENT') ? 2 : 5, name: p.displayName || '' };
  }
  // Stundenplan einer Woche aus /api/public/timetable/weekly/data (wie die Untis-Webseite)
  async function weekly(c, t, monday) {
    const r = await http(c, '/api/public/timetable/weekly/data?elementType=' + pers.type + '&elementId=' + pers.id + '&date=' + monday + '&formatId=1', null, { tok: t }),
      d = r && r.data && r.data.result && r.data.result.data;
    if (!d || !d.elementPeriods) throw err('API', 'Unerwartete Antwort beim Stundenplan.');
    const el = new Map((d.elements || []).map((e) => [e.type + ':' + e.id, e])),
      nme = (e) => e.name || e.displayname || e.longName || '';
    return (d.elementPeriods[pers.id] || [])
      .map((p) => {
        const g = (ty) => (p.elements || []).filter((e) => e.type === ty).map((e) => el.get(ty + ':' + e.id)).filter(Boolean),
          su = g(3)[0], is = p.is || {}, cs = String(p.cellState || '');
        // Rohe Untis-Kennzeichen mitschreiben (z. B. "CANCEL cancelled teacher:ABSENT"), damit sich Sonderfälle später nachvollziehen lassen
        const raw = [cs, ...Object.keys(is).filter((k) => is[k] === true), ...(p.elements || []).filter((e) => e.state && e.state !== 'REGULAR').map((e) => ({ 1: 'class', 2: 'teacher', 3: 'subject', 4: 'room' }[e.type] || e.type) + ':' + e.state)].filter(Boolean).join(' ');
        const status = is.cancelled || is.free || cs === 'CANCEL' || cs === 'FREE' ? 'cancelled'
          : is.exam || cs === 'EXAM' ? 'exam'
          : is.substitution || is.additional || is.roomSubstitution || is.shift || /SUBST|ADDITIONAL|SHIFT/.test(cs) ? 'changed' : 'ok';
        const l = mkLesson({
          id: 'w' + p.id + '|' + p.date + '|' + p.startTime,
          date: d8(p.date), start: t4(p.startTime), end: t4(p.endTime),
          subName: su ? nme(su) : '', subLong: su ? su.longName || su.displayname || '' : '',
          teacher: g(2).map(nme).join(', '), room: g(4).map(nme).join(', '), cls: g(1).map(nme).join(', '),
          status, raw, note: [p.substText, p.lessonText, p.periodText].filter(Boolean).join(' · '), src: 'ms',
        });
        return hook(H.lesson, p, l);
      })
      .filter(Boolean);
  }

  const nm = (x) => (x ? x.name || x.longname || x.longName || '' : ''),
    lg = (x) => (x ? x.longname || x.longName || x.name || '' : '');
  const fromRpc = (p) => {
    const su = (p.su || [])[0];
    const code = p.code, status = code === 'cancelled' ? 'cancelled' : code === 'irregular' ? 'changed' : p.lstype === 'ex' ? 'exam' : 'ok';
    const l = mkLesson({
      id: 'r' + p.id + '|' + p.date + '|' + p.startTime,
      date: d8(p.date), start: t4(p.startTime), end: t4(p.endTime),
      subName: nm(su), subLong: lg(su),
      teacher: (p.te || []).map(nm).join(', '),
      room: (p.ro || []).map(nm).join(', '),
      cls: (p.kl || []).map(nm).join(', '),
      status, note: [p.substText, p.lstext].filter(Boolean).join(' · '), src: 'rpc',
    });
    return hook(H.lesson, p, l);
  };
  // Hausaufgaben: GET /WebUntis/api/homeworks/lessons → { data: { homeworks, records, teachers, lessons } }
  const fromHw = (data, src) => {
    const by = (a) => new Map((a || []).map((x) => [x.id, x]));
    const les = by(data.lessons), te = by(data.teachers), rec = new Map((data.records || []).map((x) => [x.homeworkId, x]));
    return (data.homeworks || [])
      .map((h) => {
        const le = les.get(h.lessonId) || {}, t = te.get((rec.get(h.id) || {}).teacherId) || {};
        const x = mkHw({
          id: 'h' + h.id, date: d8(h.date), due: d8(h.dueDate), text: h.text || '', remark: h.remark || '',
          subName: le.subject || '', teacher: t.name || '', done: !!h.completed, src: src || 'rpc',
        });
        return hook(H.homework, h, x);
      })
      .filter(Boolean);
  };

  const ttOpts = (a) => ({
    options: {
      element: { id: pers.id, type: pers.type },
      startDate: n8(a.from), endDate: n8(a.to),
      showInfo: true, showSubstText: true, showLsText: true, showStudentgroup: true,
      klasseFields: ['name', 'longname'], roomFields: ['name', 'longname'],
      subjectFields: ['name', 'longname'], teacherFields: ['name', 'longname'],
    },
  });
  const P = {
    ms: {
      name: 'ms',
      async fetch(a) {
        const c = a.cfg;
        let t = '';
        if (jar.JSESSIONID) {
          try {
            t = await token(c);
          } catch (e) {
            if (e.code !== 'NEED_LOGIN') throw e;
            jar = {}; pers = null; keep();
          }
        }
        if (!t) {
          if (!a.pass) throw err('NEED_LOGIN', 'Bitte mit Microsoft anmelden.');
          await msLogin(c, a.email || c.email, a.pass);
          t = await token(c);
        }
        if (!pers) await who(c, t);
        keep();
        const out = { lessons: [], warn: [] };
        try {
          for (let m = mon(a.from); m <= a.to; m = add(m, 7)) out.lessons.push(...(await weekly(c, t, m)));
          if (api.debug) console.log('[Untis] Stundenplan', out.lessons);
        } catch (e) {
          if (e.code === 'NET' || e.code === 'NEED_LOGIN') throw e;
          try { // Ersatzweg: JSON-RPC mit derselben Sitzung
            out.lessons = ((await rpc(c, 'getTimetable', ttOpts(a))) || []).map(fromRpc).filter(Boolean);
          } catch (e2) {
            throw err(e.code || 'API', 'Stundenplan: ' + e.message);
          }
        }
        try {
          const h = await http(c, '/api/homeworks/lessons?startDate=' + n8(a.hwFrom) + '&endDate=' + n8(a.hwTo), null, { tok: t });
          if (api.debug) console.log('[Untis] Hausaufgaben roh', h);
          out.homework = fromHw(h.data || h, 'ms');
        } catch (e) {
          out.warn.push('Hausaufgaben: ' + e.message); // Stundenplan bleibt trotzdem erhalten
        }
        return out;
      },
    },
    rpc: {
      name: 'rpc',
      async fetch(a) {
        const c = a.cfg;
        if (!c.proxy || !c.server || !c.school) throw err('CONFIG', 'Server, Schulname und Proxy-URL fehlen (Untis.configure).');
        const go = async () => {
          if (!jar.JSESSIONID || !pers) await login(c, a.pass);
          return rpc(c, 'getTimetable', ttOpts(a));
        };
        let t;
        try {
          t = await go();
        } catch (e) {
          if (e.code !== 'NEED_LOGIN' || !a.pass) throw e;
          jar = {}; pers = null; keep(); // Sitzung abgelaufen → einmal neu anmelden
          t = await go();
        }
        if (api.debug) console.log('[Untis] Stundenplan roh', t);
        const out = { lessons: (t || []).map(fromRpc).filter(Boolean), warn: [] };
        try {
          const h = await http(c, '/api/homeworks/lessons?startDate=' + n8(a.hwFrom) + '&endDate=' + n8(a.hwTo));
          if (api.debug) console.log('[Untis] Hausaufgaben roh', h);
          out.homework = fromHw(h.data || h, 'rpc');
        } catch (e) {
          out.warn.push('Hausaufgaben: ' + e.message); // Stundenplan bleibt trotzdem erhalten
        }
        return out;
      },
    },
  };

  async function sync(o) {
    o = o || {};
    if (busy) throw err('BUSY', 'Es läuft bereits ein Abgleich.');
    const c = D.cfg, p = P[o.provider || c.provider];
    if (!p) throw err('CONFIG', 'Unbekannte Quelle: ' + c.provider);
    const from = o.from || mon(today()), to = o.to || add(from, 7 * c.weeks - 1);
    busy = true; lastErr = null;
    emit('status', status());
    try {
      const r = await p.fetch({ cfg: c, from, to, pass: o.pass, email: o.email, hwFrom: add(today(), -14), hwTo: add(today(), 60) });
      const n = ingest(r, { from, to, src: p.name });
      return Object.assign(n, { warn: r.warn || [] });
    } catch (e) {
      lastErr = e;
      throw e;
    } finally {
      busy = false;
      emit('status', status());
    }
  }
  async function logout() {
    try {
      if (jar.JSESSIONID && D.cfg.provider === 'rpc') await rpc(D.cfg, 'logout', {});
    } catch (e) {}
    jar = {}; pers = null; keep();
    emit('status', status());
  }

  // ---------- Quelle A: ICS-Datei (Untis-Kalenderexport) ----------
  // Feldbelegung (SUMMARY = Fach, LOCATION = Raum, DESCRIPTION = Rest) ist eine Annahme –
  // einmal mit echter Datei prüfen und bei Bedarf über Untis.hooks.ics(rawEvent, lesson) anpassen.
  const unesc = (v) => v.replace(/\\([nN,;\\])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));
  function parseIcs(text) {
    const out = [], rows = String(text).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
    let ev = null;
    for (const r of rows) {
      if (r === 'BEGIN:VEVENT') ev = {};
      else if (r === 'END:VEVENT') { if (ev) out.push(ev); ev = null; }
      else if (ev) {
        const i = r.indexOf(':');
        if (i < 0) continue;
        const [k, ...ps] = r.slice(0, i).split(';'), p = {};
        ps.forEach((x) => { const [a, b] = x.split('='); p[a.toUpperCase()] = b; });
        ev[k.toUpperCase()] = { v: unesc(r.slice(i + 1)), p };
      }
    }
    return out;
  }
  const icsDate = (v) => {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/.exec(v);
    if (!m) return null;
    if (m[7]) { // UTC → lokale Zeit
      const d = new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]));
      return { date: iso(d), time: pad(d.getHours()) + ':' + pad(d.getMinutes()) };
    }
    return { date: m[1] + '-' + m[2] + '-' + m[3], time: (m[4] || '00') + ':' + (m[5] || '00') }; // lokal/TZID
  };
  function importIcs(text) {
    const les = [];
    for (const e of parseIcs(text)) {
      if (!e.DTSTART || !e.DTEND || (e.DTSTART.p.VALUE || '') === 'DATE') continue; // Ganztägiges (Ferien …) ignorieren
      const s = icsDate(e.DTSTART.v), t = icsDate(e.DTEND.v);
      if (!s || !t) continue;
      const g = (k) => (e[k] ? e[k].v : '');
      const cancelled = /CANCELLED/i.test(g('STATUS')) || /entf(ä|a)llt|cancel/i.test(g('SUMMARY'));
      const l = mkLesson({
        id: 'i' + (g('UID') || g('SUMMARY')) + '|' + s.date + '|' + s.time,
        date: s.date, start: s.time, end: t.time,
        subName: g('SUMMARY').trim(), room: g('LOCATION').trim(), note: g('DESCRIPTION').trim(),
        status: cancelled ? 'cancelled' : 'ok', src: 'ics',
      });
      const x = hook(H.ics, e, l);
      if (x) les.push(x);
    }
    if (!les.length) throw err('ICS', 'In der Datei wurden keine Unterrichtstermine gefunden.');
    const ds = les.map((l) => l.date).sort();
    ingest({ lessons: les }, { from: ds[0], to: ds[ds.length - 1], src: 'ics' });
    return les.length;
  }

  // ---------- Lesen (für die Views) ----------
  const merge = (a, gap) => {
    const r = [];
    for (const l of a) {
      const p = r[r.length - 1];
      if (p && p.sub === l.sub && p.subName === l.subName && p.room === l.room && p.teacher === l.teacher &&
          p.status === l.status && mm(l.start) - mm(p.end) <= gap && mm(l.start) >= mm(p.end)) {
        r[r.length - 1] = Object.assign({}, p, { end: l.end, n: p.n + 1 });
      } else r.push(Object.assign({ n: 1 }, l));
    }
    return r;
  };
  // Eine Klausur ersetzt die Stunden, die zur selben Zeit liegen (Untis lässt sie oft unverändert stehen):
  // diese Stunden fallen weg, bevor Doppelstunden zusammengefasst werden. Eine Stunde nach der Klausur bleibt stehen.
  const dropUnderExam = (a) => {
    const ex = a.filter((l) => l.status === 'exam');
    return ex.length ? a.filter((l) => l.status === 'exam' || !ex.some((e) => l.start < e.end && l.end > e.start)) : a;
  };
  const day = (d, o) => {
    const a = dropUnderExam(D.days[d] || []).map((l) => Object.assign({}, l));
    return o && o.merge ? merge(a, typeof o.merge === 'number' ? o.merge : 10) : a;
  };
  const range = (a, b) => {
    const r = [];
    for (let d = a; d <= b; d = add(d, 1)) r.push(...day(d));
    return r;
  };
  const week = (d, o) => {
    const m = mon(d || today()), days = [];
    for (let i = 0; i < 7; i++) {
      const x = add(m, i), l = day(x, o);
      if (i < 5 || l.length) days.push({ date: x, wd: i, lessons: l }); // Sa/So nur, wenn Unterricht
    }
    return { from: m, to: add(m, 6), prev: add(m, -7), next: add(m, 7), days };
  };
  const slots = (w) => {
    const s = new Map();
    w.days.forEach((d) => d.lessons.forEach((l) => s.set(l.start + '-' + l.end, { start: l.start, end: l.end })));
    return [...s.values()].sort((a, b) => a.start.localeCompare(b.start));
  };
  const next = (now) => {
    now = now || new Date();
    const d = iso(now), t = pad(now.getHours()) + ':' + pad(now.getMinutes());
    for (let i = 0; i < 14; i++) {
      const x = add(d, i);
      for (const l of day(x)) if (l.status !== 'cancelled' && (x > d || l.end > t)) return Object.assign({ running: x === d && l.start <= t }, l);
    }
    return null;
  };

  const homework = (o) => {
    o = o || {};
    let a = D.hw.map((h) => Object.assign({}, h, { done: h.id in D.done ? D.done[h.id] : h.done }));
    if (o.open) a = a.filter((h) => !h.done);
    if (o.sub) a = a.filter((h) => h.sub === o.sub);
    if (o.from) a = a.filter((h) => (h.due || h.date) >= o.from);
    if (o.to) a = a.filter((h) => (h.due || h.date) <= o.to);
    return a.sort((x, y) => (x.due || x.date).localeCompare(y.due || y.date) || x.subName.localeCompare(y.subName));
  };
  const homeworkBySubject = (o) => {
    const m = new Map();
    for (const h of homework(o)) {
      const k = h.sub || h.subName || '?';
      if (!m.has(k)) m.set(k, { key: k, sub: h.sub, name: h.sub && typeof NM !== 'undefined' && NM[h.sub] ? NM[h.sub] : h.subName || 'Sonstige', items: [] });
      m.get(k).items.push(h);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  };
  const setDone = (id, v) => { D.done[id] = !!v; save(); emit('change'); };
  const hwAdd = (o) => {
    const h = mkHw(Object.assign({ date: today(), subName: o.sub && typeof NM !== 'undefined' ? NM[o.sub] || '' : '' }, o, { src: 'manual', id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) }));
    D.hw.push(h);
    save();
    emit('change');
    return h;
  };
  const hwRemove = (id) => {
    D.hw = D.hw.filter((h) => !(h.id === id && h.src === 'manual'));
    save();
    emit('change');
  };

  // ---------- Konfiguration / Status / Daten ----------
  function configure(p) {
    if (p) {
      p = Object.assign({}, p);
      delete p.pass; delete p.password; // Passwörter werden nie gespeichert
      delete p.url; delete p.server; delete p.school; delete p.proxy; // stehen fest (FIX)
      if (p.email != null) p.email = String(p.email).trim();
      const old = JSON.stringify(D.cfg.subjectMap);
      Object.assign(D.cfg, p);
      if (JSON.stringify(D.cfg.subjectMap) !== old) remap();
      save();
      emit('change');
    }
    return JSON.parse(JSON.stringify(D.cfg));
  }
  const status = () => ({
    busy, error: lastErr, provider: D.cfg.provider, connected: !!jar.JSESSIONID, who: pers && pers.name ? pers.name : '',
    lastSync: D.sync ? D.sync.at : null, range: D.sync ? [D.sync.from, D.sync.to] : null,
    lessons: Object.values(D.days).reduce((n, a) => n + a.length, 0), homework: D.hw.length,
  });
  const backup = () => ({ v: 1, cfg: Object.assign({}, D.cfg, { user: '', email: '' }), days: D.days, hw: D.hw, done: D.done, sync: D.sync });
  const restore = (b) => {
    if (!b || b.v !== 1 || typeof b.days !== 'object' || !Array.isArray(b.hw)) return false;
    const mine = { email: D.cfg.email, user: D.cfg.user }; // Zugangsdaten stehen nicht in der Sicherung
    D = fill(b);
    if (!D.cfg.email) D.cfg.email = mine.email;
    if (!D.cfg.user) D.cfg.user = mine.user;
    save();
    emit('change');
    return true;
  };
  const reset = () => {
    jar = {}; pers = null; keep(); D = blank();
    try { localStorage.removeItem(KEY); } catch (e) {}
    emit('change');
  };
  const setResolver = (fn) => {
    resolver = typeof fn === 'function' ? fn : null;
    remap();
    save();
  };
  const use = (name, provider) => { P[name] = Object.assign({ name }, provider); }; // provider.fetch({cfg,from,to,pass,hwFrom,hwTo}) → {lessons?, homework?, warn?}

  const api = {
    configure, status, on, sync, logout, importIcs, ingest, use, setResolver,
    day, week, range, slots, next,
    homework, homeworkBySubject, setDone, hwAdd, hwRemove,
    mapSubject: sub, unmapped, backup, restore, reset,
    util: { iso, add, mon, today }, hooks: H, debug: false,
  };
  return api;
})();
