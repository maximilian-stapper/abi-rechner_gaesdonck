/* =============================================================================
 * untis-mobile.js – Anmeldung über den „Untis Mobile“-Schlüssel (reine Logik, kein HTML)
 *
 * WARUM: Schulen mit Microsoft-Anmeldung haben kein Untis-Passwort. Die Untis-Mobile-App meldet sich dort mit einem
 * geteilten Schlüssel an (WebUntis → Profil → Freigaben → „Zugriff über Untis Mobile“ → „QR-Code anzeigen“:
 * Felder Benutzer und Schlüssel). Aus dem Schlüssel wird für jede Anfrage ein Einmalcode (TOTP, RFC 6238) gebildet.
 * So braucht es weder Passwort noch Microsoft-Sitzung, und der Schlüssel verlässt das Gerät nie, nur der Einmalcode.
 *
 * Schnittstelle: POST <proxy>/<server>/WebUntis/jsonrpc_intern.do  (die „2017“-Methoden der Untis-Mobile-App).
 * ACHTUNG: Das ist eine inoffizielle, nicht dokumentierte Schnittstelle. Feldnamen sind aus anderen Projekten
 * übernommen und nicht gegen jede Schule geprüft. Darum liest der Code tolerant und liefert bei Abweichungen
 * eine Beschreibung der Antwortstruktur (nur Feldnamen, keine Inhalte) mit.
 * Hier wird nur der Abruf der Hausaufgaben genutzt; den Stundenplan liefert der Kalender-Link (untis-ui.js).
 * ========================================================================== */
const UntisMobile = (() => {
  'use strict';
  const err = (code, msg) => Object.assign(new Error(msg), { code });

  // ---------- Einmalcode (TOTP, SHA-1, 6 Stellen, 30 Sekunden) ----------
  function b32(s) {
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', clean = String(s || '').toUpperCase().replace(/[\s=-]/g, '');
    if (!clean || /[^A-Z2-7]/.test(clean)) throw err('KEY', 'Der Schlüssel ist ungültig. Er besteht nur aus Buchstaben A–Z und Ziffern 2–7.');
    let bits = '';
    for (const c of clean) bits += A.indexOf(c).toString(2).padStart(5, '0');
    const out = new Uint8Array(Math.floor(bits.length / 8));
    for (let i = 0; i < out.length; i++) out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
    return out;
  }
  async function totp(secret, ms) {
    if (!(typeof crypto !== 'undefined' && crypto.subtle)) throw err('CRYPTO', 'Dieser Browser kann den Einmalcode nicht berechnen (Seite nur über https öffnen).');
    const key = await crypto.subtle.importKey('raw', b32(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const ctr = Math.floor((ms == null ? Date.now() : ms) / 30000), buf = new Uint8Array(8);
    for (let i = 7, c = ctr; i >= 0; i--, c = Math.floor(c / 256)) buf[i] = c % 256;
    const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf)), o = h[19] & 15;
    const bin = ((h[o] & 0x7f) * 16777216) + (h[o + 1] << 16) + (h[o + 2] << 8) + h[o + 3];
    return String(bin % 1e6).padStart(6, '0');
  }

  // 'untis://setschool?url=gaesdonck.webuntis.com&school=gaesdonck&user=abc&key=ABCDEF&schoolNumber=123' → Teile
  function parseQr(text) {
    const m = /^\s*untis:\/\/setschool\?(.+?)\s*$/i.exec(String(text || ''));
    if (!m) return null;
    const p = new URLSearchParams(m[1]);
    return { server: p.get('url') || '', school: p.get('school') || '', user: p.get('user') || '', key: p.get('key') || '' };
  }

  // ---------- Anfrage ----------
  async function rpc(c, method, params) {
    if (!c.proxy || !c.server || !c.school) throw err('CONFIG', 'Server, Schule und Worker-Adresse fehlen.');
    if (!c.user || !c.key) throw err('CONFIG', 'Benutzer und Schlüssel aus Untis Mobile fehlen.');
    const now = Date.now(), otp = await totp(c.key, now);
    const url = c.proxy.replace(/\/+$/, '') + '/' + c.server + '/WebUntis/jsonrpc_intern.do?m=' + method + '&school=' + encodeURIComponent(c.school) + '&v=i2.2';
    const body = { id: 'abirechner', method, params: [Object.assign({}, params, { auth: { user: c.user, otp, clientTime: now } })], jsonrpc: '2.0' };
    let r;
    try {
      r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit' });
    } catch (e) {
      throw err('NET', 'Keine Verbindung zum Worker. Internet, Worker-Adresse und Freigabe (CSP, OK_ORIGINS) prüfen.');
    }
    if (!r.ok) throw err('HTTP', 'Untis oder der Worker antwortet mit Fehler ' + r.status + '.');
    let j;
    try {
      j = await r.json();
    } catch (e) {
      throw err('API', 'Die Antwort von Untis ist kein JSON.');
    }
    if (j && j.error) {
      const code = j.error.code;
      throw err(code === -8504 || /auth|otp|user/i.test(String(j.error.message)) ? 'AUTH' : 'API',
        'Untis lehnt die Anmeldung ab (' + (j.error.message || 'Fehler') + (code != null ? ', ' + code : '') + '). Benutzer und Schlüssel prüfen, außerdem die Uhrzeit des Geräts (sie muss stimmen).');
    }
    return j && j.result;
  }

  // Nur Feldnamen, nie Inhalte: hilft, falls die Schule andere Namen verwendet
  function shape(r) {
    if (!r || typeof r !== 'object') return 'leer';
    return Object.keys(r).slice(0, 12).map((k) => {
      const v = r[k];
      if (Array.isArray(v)) return k + '[' + v.length + (v[0] && typeof v[0] === 'object' ? ': ' + Object.keys(v[0]).slice(0, 10).join(', ') : '') + ']';
      return k;
    }).join('; ');
  }

  // ---------- Hausaufgaben ----------
  const pick = (o, ...ks) => {
    for (const k of ks) if (o && o[k] != null && o[k] !== '') return o[k];
    return '';
  };
  const dt = (v) => {
    const s = v == null ? '' : String(v);
    if (/^\d{8}$/.test(s)) return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8);
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
    return m ? m[1] : '';
  };
  const by = (a) => new Map((Array.isArray(a) ? a : []).map((x) => [x.id, x]));

  // Aus der Antwort von getHomeWork2017 die Normalform der Library bauen: { id, subName, text, due, … }
  function parseHomework(r) {
    const list = (r && (r.homeWorks || r.homeworks || r.homeWork)) || [];
    const les = by(r && r.lessons), te = by(r && r.teachers);
    const rec = new Map(((r && r.records) || []).map((x) => [x.homeworkId, x]));
    return list.map((h) => {
      const le = les.get(h.lessonId) || {}, t = te.get(h.teacherId) || te.get((rec.get(h.id) || {}).teacherId) || {};
      return {
        id: 'u' + pick(h, 'id', 'homeworkId'),
        date: dt(pick(h, 'date', 'startDate', 'assignedDate')),
        due: dt(pick(h, 'dueDate', 'due', 'endDate')),
        text: String(pick(h, 'text', 'description', 'title', 'homework')),
        remark: String(pick(h, 'remark', 'note')),
        subName: String(pick(h, 'subject', 'subjectName', 'subjectShortName') || pick(le, 'subject', 'subjectName', 'name', 'longName', 'displayName')),
        teacher: String(pick(h, 'teacher', 'teacherName') || pick(t, 'name', 'displayName', 'longName')),
        done: !!(h.completed != null ? h.completed : h.done),
      };
    });
  }

  // Holt die Hausaufgaben. Rückgabe: { homework, warn:[…] }
  async function homework(c, from, to) {
    const ud = await rpc(c, 'getUserData2017', {}), u = (ud && (ud.userData || ud)) || {};
    const id = pick(u, 'elemId', 'id', 'studentId', 'personId');
    if (id === '') throw err('API', 'Untis liefert keine Schüler-Kennung. Struktur: ' + shape(ud));
    const r = await rpc(c, 'getHomeWork2017', { id, type: 'STUDENT', startDate: from, endDate: to });
    const hw = parseHomework(r), warn = [];
    if (!r || !(r.homeWorks || r.homeworks || r.homeWork)) warn.push('Die Antwort enthält keine Hausaufgaben-Liste. Struktur: ' + shape(r));
    else if (hw.length && hw.every((h) => !h.subName)) warn.push('Zu den Hausaufgaben fehlt das Fach in der Antwort. Struktur: ' + shape(r));
    return { homework: hw, warn };
  }
  // Nur die Anmeldung prüfen (ohne Hausaufgaben)
  async function test(c) {
    const ud = await rpc(c, 'getUserData2017', {}), u = (ud && (ud.userData || ud)) || {};
    return { name: String(pick(u, 'displayName', 'name', 'longName') || ''), shape: shape(ud) };
  }

  return { totp, b32, parseQr, homework, test, parseHomework, shape };
})();
