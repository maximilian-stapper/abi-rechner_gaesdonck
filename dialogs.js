// Farbskala für die Noteneingabe (Rot → Gelb → Grün, Farben wie --no, --w, --ok in style.css).
// Statt Punkte zu tippen, wählt man die Note an; gespeichert werden weiterhin Punkte (0–15).
const SC = [
    [255, 107, 97],
    [232, 176, 74],
    [76, 210, 122],
  ],
  col = (p) => {
    const t = p / 7.5,
      i = t < 1 ? 0 : 1,
      f = t - i;
    return SC[i].map((x, k) => Math.round(x + (SC[i + 1][k] - x) * f)).join(',');
  },
  scin = (v, ph) =>
    v === '' || v == null ? `<span>${ph}</span>` : `<b>${NT[v]}</b><small>${v} Punkte</small>`,
  sv = (v, ph = 'Note wählen', id = '') => {
    const h = v !== '' && v != null;
    return `<button type=button class="sc${h ? ' has' : ''}" data-a=sc data-ph="${ph}" data-v="${h ? v : ''}"${id ? ' id=' + id : ''}${h ? ` style="--c:${col(v)}"` : ''}>${scin(v, ph)}</button>`;
  },
  scale = () =>
    Array.from({ length: 16 }, (_, i) => 15 - i)
      .map(
        (p) =>
          `<button type=button class=pc data-a=pc data-p=${p} style="--c:${col(p)}" aria-label="${NT[p]}, ${p} Punkte"><b>${NT[p]}</b><small>${p}</small></button>`,
      )
      .join('');
function paint(el, v) {
  const h = v !== '' && v != null;
  el.dataset.v = h ? +v : '';
  el.classList.toggle('has', h);
  if (h) el.style.setProperty('--c', col(+v));
  else el.style.removeProperty('--c');
  el.innerHTML = scin(h ? +v : '', el.dataset.ph);
}
function syncSc() {
  const a = document.querySelector('#dlg .sc.on'),
    v = a ? a.dataset.v : '';
  document
    .querySelectorAll('#dlg .pc')
    .forEach((c) => c.classList.toggle('sel', v !== '' && c.dataset.p === v));
}
function actv(el) {
  document.querySelectorAll('#dlg .sc.on').forEach((x) => x.classList.remove('on'));
  if (el) {
    el.classList.add('on');
    el.scrollIntoView({ block: 'nearest' });
  }
  syncSc();
}
function pick(p) {
  const a = document.querySelector('#dlg .sc.on');
  if (a) {
    paint(a, p);
    syncSc();
  }
}
const mrow = (r) =>
    `<div class=ir>${sv(r.n)}<input type=number inputmode=decimal step=any min=0 placeholder=Gewicht value="${r.w === '' || r.w == null ? '' : r.w}"></div>`,
  srow = (v) => `<div class=ir>${sv(v)}</div>`;
function edit(k) {
  const c = courses().find((x) => x.k == k),
    g = st.g[k] || {},
    b = c.t == 'B',
    sc = c.t == 'S' || c.t == 'LK',
    d = $('#dlg');
  d.className = 'ed';
  d.innerHTML =
    `<h3>${esc(nm(c))}</h3><div class=dbody>` +
    (b
      ? '<small>Eine Note zählt für Q1.1 und Q1.2 (doppelt). Freiwillig: Sie wird nur eingebracht, wenn sie deinen Schnitt verbessert.</small>'
      : `<h4>Mündlich (Gewicht optional)</h4><div id=mr>${(g.m && g.m.length ? g.m : [{ n: '', w: '' }]).map(mrow).join('')}</div><button class=bt data-a=am>+ Note</button>` +
        (sc
          ? `<h4>Schriftlich</h4>${c.i == 1 ? '<small>Facharbeit in diesem Fach? Sie ersetzt eine Klausur: trag ihre Note einfach als Klausur ein.</small>' : ''}<div id=sr>${(g.s && g.s.length ? g.s : ['']).map(srow).join('')}</div><button class=bt data-a=as>+ Klausur</button>`
          : '')) +
    `<h4>Endnote (von der Lehrkraft festgelegt)</h4><div class=ir>${sv(g.f ?? '', 'leer = vorläufig', 'fin')}</div></div>` +
    `<div class=dock><div class=dh><span>Tippe auf eine Note</span><button type=button class=lk data-a=pc data-p="">Feld leeren</button></div><div class=scale>${scale()}</div><div class=bar><button class=bt data-a=cx>Abbrechen</button><button class="bt pr" data-a=sv data-k="${k}">Speichern</button></div></div>`;
  d.showModal();
  actv(d.querySelector('.sc'));
}
const cl = (v) => (v === '' ? '' : Math.min(15, Math.max(0, Math.round(+v))));
function saveEdit(k) {
  const g = {},
    rows = (s) =>
      [...document.querySelectorAll(s + ' .ir')].map((d) =>
        [...d.querySelectorAll('.sc,input')].map((i) => (i.matches('.sc') ? i.dataset.v : i.value)),
      );
  g.m = rows('#mr')
    .filter((r) => r[0] !== '')
    .map((r) => ({ n: cl(r[0]), w: r[1] ? +r[1] : '' }));
  g.s = rows('#sr')
    .filter((r) => r[0] !== '')
    .map((r) => cl(r[0]));
  g.f = cl($('#fin').dataset.v) === '' ? null : cl($('#fin').dataset.v);
  st.g[k] = g;
  save();
  $('#dlg').close();
  render();
}
function menu() {
  $('#dlg').className = '';
  $('#dlg').innerHTML =
    `<h3>Menü</h3><button class=bt data-a=wz>Fächer und Abiturfächer ändern</button><button class=bt data-a=ex>Sicherungsdatei speichern</button><button class=bt data-a=im>Sicherungsdatei laden</button><button class=bt data-a=rs style="color:var(--no)">Alle Daten löschen</button><small>Deine Noten liegen nur in diesem Browser auf diesem Gerät. Speichere regelmäßig eine Sicherungsdatei, denn Safari kann Daten nach längerer Nichtnutzung löschen. Hilfreich: Seite zum Home-Bildschirm hinzufügen. <button type=button class=lk data-a=dsg>Datenschutz</button></small><div class=bar><button class=bt data-a=cx>Schließen</button></div>`;
  $('#dlg').showModal();
}
// Datenschutzhinweise (Menü, Untis-Einrichtung, Erinnerungen: data-a=dsg). Bei Änderungen an Workern,
// gespeicherten Daten oder Anbietern hier mitziehen.
function privacy() {
  const d = $('#dlg'),
    h = (t, ...p) => `<h4>${t}</h4>` + p.map((x) => `<p>${x}</p>`).join('');
  d.className = 'un ds';
  d.innerHTML =
    `<h3>Datenschutz</h3><div class=dbody>` +
    `<p><b>Kurz:</b> Noten und LuPO-Datei verlassen nie dein Gerät. Nur für Untis und die Erinnerungen laufen einzelne Daten über zwei kleine Server dieser App (Cloudflare Worker), und das nur, wenn du sie benutzt.</p>` +
    h('Wer steckt dahinter?', 'Ein privates, nicht kommerzielles Schülerprojekt, kein Angebot der Schule und nicht von Untis. Ansprechpartner: <a href="https://github.com/maximilian-stapper/abi-rechner_gaesdonck" target=_blank rel=noopener>maximilian-stapper auf GitHub</a>.') +
    h(
      'Auf deinem Gerät',
      'Fächer, Noten, Stundenplan, Hausaufgaben und Einstellungen liegen im Speicher dieses Browsers. Die LuPO-Datei wird nur hier gelesen, nicht hochgeladen. E-Mail, ein gemerktes Passwort, Kalender-Link und Untis-Mobile-Schlüssel bleiben auf diesem Gerät und stehen nie in der Sicherungsdatei.',
      'Ein gemerktes Passwort liegt unverschlüsselt im Browserspeicher. Auf geteilten Geräten lieber nicht merken.',
    ) +
    h(
      'Untis-Anmeldung',
      'Mit Microsoft gehen E-Mail und Passwort beim Anmelden über den Untis-Worker an Microsoft und Untis, so wie beim Knopf <i>Office 365</i> auf der Untis-Seite. Der Worker reicht nur weiter und speichert nichts. Stundenplan und Hausaufgaben kommen danach über denselben Worker von gaesdonck.webuntis.com.',
      '<b>Ohne Microsoft-Passwort</b> geht es auch: mit deinem Untis-Benutzer und dem Untis-Mobile-Schlüssel (Hausaufgaben; der Schlüssel bleibt auf dem Gerät, über den Worker geht nur ein Einmalcode), mit dem Kalender-Link (Stundenplan) oder mit einer ICS-Datei (ganz ohne Server). Zu finden unter <i>Untis → Einrichten → Andere Wege</i>, die E-Mail dafür leer lassen.',
      'Die App nutzt Untis-Schnittstellen, die Untis nicht offiziell anbietet.',
    ) +
    h(
      'Erinnerungen (nur wenn eingeschaltet)',
      'Beim Erinnerungs-Worker liegen die Push-Adresse deines Geräts, deine Einstellungen und von den offenen Hausaufgaben Fach, Fälligkeit und Text. Keine Namen, keine Zugangsdaten. Die Mitteilung läuft über den Push-Dienst deines Geräts (Apple, Google oder Mozilla).',
      'Grundlage ist deine Einwilligung durch das Einschalten. <i>Ausschalten</i> widerruft sie und löscht alles sofort, sonst verfällt der Eintrag nach 60 Tagen ohne Kontakt. Wenn du unter 16 bist, frag vorher deine Eltern.',
    ) +
    h('Anbieter', 'Die Seite liegt bei GitHub (GitHub Pages), die Worker bei Cloudflare. Beide sind US-Unternehmen und nach dem EU-US Data Privacy Framework zertifiziert. Sie sehen bei jedem Aufruf technisch deine IP-Adresse und können Zugriffe kurz protokollieren (Zeit, Adresse, keine Inhalte).') +
    h('Deine Rechte', 'Du kannst Auskunft, Berichtigung und Löschung verlangen und Einwilligungen widerrufen. Fast alles geht direkt in der App: <i>Menü → Alle Daten löschen</i> und <i>Erinnerungen → Ausschalten</i>. Beschweren kannst du dich bei der Landesbeauftragten für Datenschutz NRW.') +
    `</div><div class=bar><span></span><button type=button class="bt pr" data-a=cx>Schließen</button></div>`;
  if (!d.open) d.showModal();
  d.querySelector('.dbody').scrollTop = 0;
}
