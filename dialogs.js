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
    `<div class=ir>${sv(r.n)}<input type=number inputmode=decimal step=any min=0 placeholder=Gewicht value="${r.w || ''}"></div>`,
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
      ? '<small>Eine Note zählt für Q1.1 und Q1.2.</small>'
      : `<h4>Mündlich (Gewicht optional)</h4><div id=mr>${(g.m && g.m.length ? g.m : [{ n: '', w: '' }]).map(mrow).join('')}</div><button class=bt data-a=am>+ Note</button>` +
        (sc
          ? `<h4>Schriftlich</h4><div id=sr>${(g.s && g.s.length ? g.s : ['']).map(srow).join('')}</div><button class=bt data-a=as>+ Klausur</button>`
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
    `<h3>Menü</h3><button class=bt data-a=wz>Fächer und Abiturfächer ändern</button><button class=bt data-a=ex>Sicherungsdatei speichern</button><button class=bt data-a=im>Sicherungsdatei laden</button><button class=bt data-a=rs style="color:var(--no)">Alle Daten löschen</button><small>Deine Daten liegen nur in diesem Browser auf diesem Gerät. Speichere regelmäßig eine Sicherungsdatei, denn Safari kann Daten nach längerer Nichtnutzung löschen. Hilfreich: Seite zum Home-Bildschirm hinzufügen.</small><div class=bar><button class=bt data-a=cx>Schließen</button></div>`;
  $('#dlg').showModal();
}
