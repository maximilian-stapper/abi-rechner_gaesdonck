const mrow = (r) =>
    `<div class=ir><input type=number min=0 max=15 inputmode=numeric placeholder=Punkte value="${r.n}"><input type=number step=any min=0 placeholder="Gewicht (optional)" value="${r.w || ''}"></div>`,
  srow = (v) =>
    `<div class=ir><input type=number min=0 max=15 inputmode=numeric placeholder=Punkte value="${v}"></div>`;
function edit(k) {
  const c = courses().find((x) => x.k == k),
    g = st.g[k] || {},
    b = c.t == 'B',
    sc = c.t == 'S' || c.t == 'LK';
  $('#dlg').innerHTML =
    `<h3>${esc(nm(c))}</h3>` +
    (b
      ? '<small>Eine Note zählt für Q1.1 und Q1.2.</small>'
      : `<h4>Mündlich</h4><div id=mr>${(g.m && g.m.length ? g.m : [{ n: '', w: '' }]).map(mrow).join('')}</div><button class=bt data-a=am>+ Note</button>` +
        (sc
          ? `<h4>Schriftlich</h4><div id=sr>${(g.s && g.s.length ? g.s : ['']).map(srow).join('')}</div><button class=bt data-a=as>+ Klausur</button>`
          : '')) +
    `<h4>Endnote (von der Lehrkraft festgelegt)</h4><input id=fin type=number min=0 max=15 placeholder="leer = vorläufig" value="${g.f ?? ''}"><div class=bar><button class=bt data-a=cx>Abbrechen</button><button class="bt pr" data-a=sv data-k="${k}">Speichern</button></div>`;
  $('#dlg').showModal();
}
const cl = (v) => (v === '' ? '' : Math.min(15, Math.max(0, Math.round(+v))));
function saveEdit(k) {
  const g = {},
    rows = (s) =>
      [...document.querySelectorAll(s + ' .ir')].map((d) =>
        [...d.querySelectorAll('input')].map((i) => i.value),
      );
  g.m = rows('#mr')
    .filter((r) => r[0] !== '')
    .map((r) => ({ n: cl(r[0]), w: r[1] ? +r[1] : '' }));
  g.s = rows('#sr')
    .filter((r) => r[0] !== '')
    .map((r) => cl(r[0]));
  g.f = cl($('#fin').value) === '' ? null : cl($('#fin').value);
  st.g[k] = g;
  save();
  $('#dlg').close();
  render();
}
function menu() {
  $('#dlg').innerHTML =
    `<h3>Menü</h3><button class=bt data-a=wz>Fächer und Abiturfächer ändern</button><button class=bt data-a=ex>Sicherungsdatei speichern</button><button class=bt data-a=im>Sicherungsdatei laden</button><button class=bt data-a=rs style="color:var(--no)">Alle Daten löschen</button><small>Deine Daten liegen nur in diesem Browser auf diesem Gerät. Speichere regelmäßig eine Sicherungsdatei, denn Safari kann Daten nach längerer Nichtnutzung löschen. Hilfreich: Seite zum Home-Bildschirm hinzufügen.</small><div class=bar><button class=bt data-a=cx>Schließen</button></div>`;
  $('#dlg').showModal();
}
