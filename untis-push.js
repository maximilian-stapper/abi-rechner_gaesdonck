/* =============================================================================
 * untis-push.js – Hausaufgaben-Erinnerungen als Mitteilung (Web Push). Modul UntisPush
 *
 * Weg: App → Erinnerungs-Worker (worker/push-worker.js, eigener Cloudflare-Worker mit KV und Cron)
 *      → Push-Dienst des Geräts (Apple, Google, Mozilla) → sw.js zeigt die Mitteilung.
 * Die App schickt dem Worker bei jeder Änderung ihre offenen Hausaufgaben (Fach, Fälligkeit, Text) und die
 * Einstellungen. Der Worker erinnert jeden Tag zur gewählten Uhrzeit an alles, was ab morgen bis in
 * „Tage vorher“ Tagen fällig ist, so lange es nicht abgehakt ist. Er meldet sich nie selbst bei Untis an.
 *
 * Für untis-ui.js: card() (Karte unter den Hausaufgaben), act(a) (Klicks data-u=nt…), set(f, v)
 * (Auswahlfelder data-uf=nt…), reset() (bei „Daten löschen“). list(hw, today) = was hochgeladen wird.
 * Einstellungen unter K + '.push', nur auf diesem Gerät (nicht in der Sicherungsdatei).
 * Wird beim Start der Seite mit #un geöffnet (Tipp auf eine Mitteilung), geht es direkt zum Untis-Tab.
 * ========================================================================== */
const UntisPush = (() => {
  'use strict';
  const U = Untis,
    WORKER = 'https://push-worker.maximilian-stapper.workers.dev',
    KEY = (typeof K !== 'undefined' ? K : 'abirechner') + '.push', // { on, days, hour, id, vk, sig, at }
    DAYS = [1, 2, 3, 4, 5, 6, 7],
    HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
    DEF = { on: false, days: 1, hour: 17, id: '', vk: '', sig: '', at: 0 };

  const read = () => {
      try {
        return Object.assign({}, DEF, JSON.parse(localStorage.getItem(KEY)) || {});
      } catch (e) {
        return Object.assign({}, DEF);
      }
    },
    write = (p) => {
      const x = Object.assign(read(), p);
      try {
        localStorage.setItem(KEY, JSON.stringify(x));
      } catch (e) {}
      return x;
    };
  const err = (code, m) => Object.assign(new Error(m), { code }),
    two = (n) => String(n).padStart(2, '0'),
    b64u = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    b64d = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
    hash = (s) => {
      let h = 5381;
      for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
      return String(h);
    };

  // ---------- Was der Worker bekommt: nur offene, nicht überfällige Hausaufgaben mit Fälligkeit ----------
  const nm = (h) => (h.sub && typeof UntisSubjects !== 'undefined' ? UntisSubjects.name(h.sub) : '') || h.subName || 'Hausaufgabe';
  const list = (hw, today) =>
    hw
      .filter((h) => !h.done && h.due && h.due >= today)
      .sort((a, b) => a.due.localeCompare(b.due))
      .slice(0, 60)
      .map((h) => ({ d: h.due, s: nm(h).slice(0, 40), t: String(h.text || '').replace(/\s+/g, ' ').trim().slice(0, 160) }));

  // ---------- Kann dieses Gerät Mitteilungen? ----------
  const ios = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
    standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches,
    perm = () => ('Notification' in window ? Notification.permission : 'denied');
  function where() {
    if (location.protocol === 'file:') return 'file';
    if (ios() && !standalone()) return 'home'; // iPhone/iPad: nur in der App vom Home-Bildschirm
    if (!('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)) return 'none';
    return perm() === 'denied' ? 'denied' : 'ok';
  }

  // ---------- Worker ----------
  async function call(path, body) {
    let r, j = null;
    try {
      r = await fetch(WORKER + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    } catch (e) {
      throw err('NET', 'Der Erinnerungs-Worker ist nicht erreichbar. Internet prüfen. Ist er schon eingerichtet (siehe README)?');
    }
    try {
      j = await r.json();
    } catch (e) {}
    if (r.status === 403) throw err('ORIGIN', 'Der Erinnerungs-Worker lässt diese Seite nicht zu (OK_ORIGINS im Worker).');
    if (!r.ok || !j || j.ok === false) throw err((j && j.code) || 'HTTP', (j && j.message) || 'Der Erinnerungs-Worker meldet Fehler ' + r.status + '.');
    return j;
  }
  const vapid = async () => (await call('/key')).key;

  // ---------- Service Worker und Push-Abo ----------
  let regP = null;
  const reg = () =>
    regP ||
    (regP = navigator.serviceWorker
      .register('sw.js', { scope: './' })
      .then(() => navigator.serviceWorker.ready)
      .catch(() => {
        regP = null;
        throw err('SW', 'Der Dienst für Mitteilungen ließ sich nicht starten. Seite neu laden und nochmal versuchen.');
      }));
  // Abo zum Schlüssel des Workers; ein Abo mit altem Schlüssel wird gekündigt und ersetzt
  async function subscribe(r, vk) {
    const old = await r.pushManager.getSubscription();
    if (old) {
      const k = old.options && old.options.applicationServerKey,
        was = k ? b64u(new Uint8Array(k)) : read().vk;
      if (was === vk) return old;
      await old.unsubscribe();
    }
    return r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64d(vk) });
  }
  // Stand an den Worker schicken: nur wenn sich etwas geändert hat (oder nach 3 Tagen, damit der Eintrag nicht verfällt)
  async function upload(force, again) {
    const c = read();
    if (!c.on || !c.id || where() !== 'ok') return;
    const r = await reg();
    let s = await r.pushManager.getSubscription();
    if (!s) {
      // Abo weg (z. B. Mitteilungen in den Einstellungen ausgeschaltet)
      if (perm() !== 'granted') {
        write({ on: false, sig: '' });
        msg = { c: 'warn', t: 'Erinnerungen sind aus, weil Mitteilungen für die App nicht mehr erlaubt sind.' };
        return;
      }
      s = await subscribe(r, c.vk || (await vapid()));
      force = true;
    }
    const body = { id: c.id, sub: s.toJSON(), days: c.days, hour: c.hour, hw: list(U.homework(), U.util.today()) },
      sig = hash(JSON.stringify(body));
    if (!force && sig === c.sig && Date.now() - c.at < 3 * 864e5) return;
    const j = await call('/save', body),
      k = j.key || (await vapid());
    if (k !== c.vk && !again) {
      // Der Worker hat neue Schlüssel (z. B. KV geleert): neu abonnieren und nochmal schicken
      await s.unsubscribe();
      await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64d(k) });
      write({ vk: k });
      return upload(true, true);
    }
    write({ sig, at: Date.now(), n: body.hw.length });
    lastErr = '';
  }

  // ---------- Aktionen ----------
  let busy = false,
    msg = null, // { c: ''|'ok'|'warn'|'err', t }
    lastErr = '',
    q = Promise.resolve();
  const paint = () => {
    const el = document.getElementById('un-push');
    if (el) el.outerHTML = card();
  };
  const say = (c, t) => {
    const m = (msg = { c, t });
    paint();
    if (c === 'ok')
      setTimeout(() => {
        if (msg !== m) return; // Erfolgsmeldungen verschwinden nach ein paar Sekunden
        msg = null;
        paint();
      }, 6000);
  };
  async function run(start, f) {
    if (busy) return;
    busy = true;
    say('', start);
    try {
      await f();
    } catch (e) {
      say('err', (e && e.message) || 'Das hat nicht geklappt.');
    } finally {
      busy = false;
      paint();
    }
  }
  const enable = () =>
    run('Schalte ein …', async () => {
      // Zuerst die Erlaubnis: Das iPhone fragt nur direkt nach einem Fingertipp
      const p = await Notification.requestPermission();
      if (p !== 'granted')
        throw err('PERM', p === 'denied' ? 'Mitteilungen sind für diese App blockiert. Erlaube sie in den Einstellungen des Geräts und tippe dann nochmal.' : 'Ohne Erlaubnis für Mitteilungen geht es nicht.');
      const [r, k] = await Promise.all([reg(), vapid()]);
      try {
        await subscribe(r, k);
      } catch (e) {
        throw err('SUB', e && e.name === 'NotAllowedError' ? 'Das Gerät hat das Abo abgelehnt. Bitte nochmal auf „Einschalten“ tippen.' : 'Das Gerät konnte sich nicht für Mitteilungen anmelden (' + ((e && e.message) || e) + ').');
      }
      write({ on: true, id: read().id || b64u(crypto.getRandomValues(new Uint8Array(18))), vk: k, sig: '' });
      try {
        await upload(true);
      } catch (e) {
        write({ on: false });
        throw e;
      }
      say('ok', 'Erinnerungen sind an. Probier es mit „Test-Mitteilung“ aus.');
    });
  async function stop() {
    const c = read();
    write({ on: false, sig: '' });
    try {
      const r = await navigator.serviceWorker.getRegistration();
      const s = r && (await r.pushManager.getSubscription());
      if (s) await s.unsubscribe();
    } catch (e) {}
    if (c.id) await call('/delete', { id: c.id });
  }
  const disable = () =>
    run('Schalte aus …', async () => {
      try {
        await stop();
        say('ok', 'Erinnerungen sind aus. Der Worker hat deine Hausaufgaben gelöscht.');
      } catch (e) {
        say('warn', 'Erinnerungen sind aus. Der Worker war nicht erreichbar, seine Kopie verfällt nach 60 Tagen von selbst.');
      }
    });
  const test = () =>
    run('Schicke eine Test-Mitteilung …', async () => {
      await upload(true);
      if (!read().on) throw err('OFF', (msg && msg.t) || 'Erinnerungen sind aus.');
      await call('/test', { id: read().id });
      say('ok', 'Test-Mitteilung ist unterwegs. Sie sollte gleich erscheinen, sonst in der Mitteilungszentrale nachsehen.');
    });
  function act(a) {
    if (a == 'nton') enable();
    else if (a == 'ntoff') disable();
    else if (a == 'nttest') test();
  }
  function set(f, v) {
    if (f == 'ntdays') write({ days: +v });
    else if (f == 'nthour') write({ hour: +v });
    else return;
    if (!read().on) return paint();
    run('Speichere …', async () => {
      await upload(true);
      say('ok', 'Gespeichert.');
    });
  }
  // „Alle Daten löschen“: ausschalten und beim Worker löschen (im Hintergrund)
  function reset() {
    stop().catch(() => {});
    msg = null;
    try {
      localStorage.removeItem(KEY);
    } catch (e) {}
  }

  // Bei jeder Änderung der Hausaufgaben (Abgleich, abgehakt, neu eingetragen) den Stand schicken, nacheinander
  const sync = () => {
    if (!read().on || busy) return;
    q = q
      .then(() => upload(false))
      .catch((e) => {
        lastErr = (e && e.message) || 'Fehler';
      })
      .then(paint);
  };
  let tm = 0;
  U.on('change', () => {
    clearTimeout(tm);
    tm = setTimeout(sync, 1500);
  });
  addEventListener('load', () => setTimeout(sync, 4000)); // Abo prüfen, Eintrag beim Worker frisch halten

  // Tipp auf eine Mitteilung: App mit #un (neu geöffnet) oder Nachricht von sw.js (lief schon)
  if (location.hash === '#un') {
    if (typeof tab !== 'undefined') tab = 'un';
    try {
      history.replaceState(null, '', location.pathname + location.search);
    } catch (e) {}
  }
  if ('serviceWorker' in navigator)
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (!e.data || e.data.open !== 'un' || (typeof tab !== 'undefined' && tab === 'un')) return;
      const b = document.querySelector('[data-u=un]');
      if (b) b.click();
    });

  // ---------- Karte unter den Hausaufgaben ----------
  function card() {
    const c = read(),
      w = where(),
      on = c.on && w === 'ok',
      dis = busy ? ' disabled' : '',
      sel = (f, a, cur, lab, al) => `<select data-uf=${f} aria-label="${al}"${dis}>${a.map((v) => `<option value=${v}${v === cur ? ' selected' : ''}>${lab(v)}</option>`).join('')}</select>`,
      m = msg ? `<div class="un-msg ${msg.c}" role=status><span>${esc(msg.t)}</span></div>` : '';
    let body;
    if (w === 'home')
      body = `<p class=d>Auf dem iPhone kommen Mitteilungen nur in der App vom Home-Bildschirm: In Safari auf <i>Teilen → Zum Home-Bildschirm</i> tippen, die App von dort öffnen und hier einschalten.</p>`;
    else if (w === 'none') body = `<p class=d>Dieser Browser kann keine Mitteilungen empfangen. Auf dem iPhone geht es ab iOS 16.4 in der App vom Home-Bildschirm.</p>`;
    else if (w === 'file') body = `<p class=d>Mitteilungen gehen nur über die Webseite, nicht aus einer lokalen Datei.</p>`;
    else {
      const span = c.days === 1 ? 'am nächsten Tag' : `in den nächsten ${c.days} Tagen`,
        rows =
          `<div class=ir><span class=un-map>Erinnern</span>${sel('ntdays', DAYS, c.days, (v) => (v === 1 ? 'nur am Vortag' : v === 7 ? 'ab einer Woche vorher' : `ab ${v} Tagen vorher`), 'Ab wie vielen Tagen vor der Abgabe')}</div>` +
          `<div class=ir><span class=un-map>Uhrzeit</span>${sel('nthour', HOURS, c.hour, (v) => two(v) + ':00 Uhr', 'Uhrzeit der Erinnerung')}</div>`,
        bar = on
          ? `<button type=button class=bt data-u=nttest${dis}>Test-Mitteilung</button><button type=button class=bt data-u=ntoff${dis}>Ausschalten</button>`
          : `<button type=button class="bt pr" data-u=nton${dis}>Erinnerungen einschalten</button>`,
        note = on
          ? `${c.at ? `Zuletzt an den Worker geschickt: ${new Date(c.at).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}${c.n != null ? `, ${c.n} offene Hausaufgabe${c.n === 1 ? '' : 'n'}` : ''}. ` : ''}Neue Hausaufgaben aus Untis kommen dazu, sobald die App abgleicht (beim Öffnen). Fach, Fälligkeit und Text der offenen Hausaufgaben liegen dafür beim Erinnerungs-Worker; Ausschalten löscht sie dort.`
          : 'Dafür schickt die App Fach, Fälligkeit und Text deiner offenen Hausaufgaben an den Erinnerungs-Worker, sonst nichts (keine Namen, keine Zugangsdaten).';
      body =
        `<p class=d>${on ? 'Jeden Tag um ' + c.hour + ' Uhr kommt' : 'Bekomm jeden Tag um ' + c.hour + ' Uhr'} eine Mitteilung mit allen offenen Hausaufgaben, die ${span} fällig sind. Abgehakte fallen raus.</p>` +
        (w === 'denied' ? `<p class="d bad">Mitteilungen sind für diese App blockiert. Erlaube sie in den Einstellungen des Geräts (iPhone: Einstellungen → Mitteilungen → Abi-Rechner).</p>` : '') +
        `<div class=un-pf>${rows}</div><div class=bar style="justify-content:flex-start;flex-wrap:wrap">${bar}</div>` +
        (on && lastErr ? `<small class="d bad un-pn">Letzte Übertragung hat nicht geklappt: ${esc(lastErr)}</small>` : '') +
        `<small class="d un-pn">${note}</small>`;
    }
    return `<div class=g id=un-push><div class=un-hh><h2>Erinnerungen</h2>${on ? '<span class=un-pon>An</span>' : ''}</div>${m}${body}</div>`;
  }

  return { card, act, set, reset, list, where };
})();
