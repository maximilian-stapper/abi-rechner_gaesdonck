function render() {
  if (!st) return wiz();
  const tabs = [
    ['ov', 'Übersicht'],
    ...SEM.map((s, i) => [i, s]),
    ['ab', 'Abitur'],
  ];
  $('#app').innerHTML =
    `<div class=top><h1>Abi-Rechner</h1><button class=bt data-a=menu aria-label=Menü>⋯</button></div><nav class=tabs>${tabs.map(([k, l]) => `<button data-t="${k}" class="${k == tab ? 'on' : ''}">${l}</button>`).join('')}</nav>` +
    (tab == 'ov' ? ov() : tab == 'ab' ? ab() : qtab(+tab));
}
function ov() {
  const r = solve();
  if (!r)
    return '<div class=g><h2>Noch keine Noten</h2><p class=d>Wähle oben ein Halbjahr und tippe auf einen Kurs, um Noten einzutragen.</p></div>';
  const T = tot(r),
    cs = courses(),
    nf = cs.filter((c) => pts(c).fin).length,
    C = r.C,
    ck = (l, s) => `<li class="${s}">${l}</li>`,
    pf = T.done ? '' : ' (Prognose)';
  const hs = [0, 1, 2, 3].map((i) => [
      SEM[i],
      wm(C.filter((c) => c.i == i || (c.t == 'B' && i < 2))),
    ]),
    fa = {};
  C.forEach((c) => {
    if (c.t != 'B') (fa[c.id] = fa[c.id] || []).push(c.p);
  });
  const fs = Object.entries(fa).map(([id, a]) => [
      NM[id],
      a.reduce((x, y) => x + y, 0) / a.length,
    ]),
    out = r.C.filter((c) => !r.keys.has(c.k)).map(nm);
  return `<div class="g hero"><div class=d>${T.fin ? 'Endergebnis' : 'Hochrechnung'}</div><div class="big mono">${grade(T.G)}</div><div class=d>${T.G} von 900 Punkten · Block I ${r.b1} · Block II ${T.b2}${pf}</div>
 <div class=prog><i style="width:${Math.round((nf / cs.length) * 100)}%"></i></div><small>${nf} von ${cs.length} Kursen mit Endnote</small></div>
 <div class=g><h2>Zulassungs-Check</h2><ul>${ck(`Kurse mit Note: ${r.ntot} (35–40 nötig)`, r.ntot < 35 ? '' : r.cnt >= 35 && r.cnt <= 40 ? 'ok' : 'no')}
 ${ck(`Defizite: ${r.d} (max. ${r.cnt <= 37 ? 7 : 8}), davon Leistungskurs ${r.ld} (max. 3)`, r.ntot < 35 ? '' : r.ok ? 'ok' : 'no')}${ck(`Block I mindestens 200: ${r.b1}`, r.b1 >= 200 ? 'ok' : 'no')}
 ${ck(`Block II mindestens 100: ${T.b2}${pf}`, !T.done ? '' : T.b2 >= 100 ? 'ok' : 'no')}${ck(`Zwei Prüfungsfächer mit mind. 5 Punkten, davon ein Leistungskurs${pf}`, !T.done ? '' : T.n5 ? 'ok' : 'no')}
 ${ck(`Gesamt mindestens 300: ${T.G}${pf}`, !T.fin ? '' : T.pass ? 'ok' : 'no')}</ul></div>
 <div class=g><h2>Halbjahresschnitte</h2>${hs.map(([l, a]) => `<div class=ir><span style="flex:1">${l}</span><b class=mono>${av(a)}</b></div>`).join('')}<h4>Fachschnitte</h4>${fs.map(([l, a]) => `<div class=ir><span style="flex:1">${esc(l)}</span><b class=mono>${av(a)}</b></div>`).join('')}</div>
 <div class=g><details><summary>Rechenweise</summary><p class=d style="margin-top:8px">Block I = Punkte ÷ Kurse × 40, Leistungskurse doppelt: ${r.P} ÷ ${r.N} × 40 = ${r.b1} (${r.cnt} eingebrachte Kurse).<br>Block II = Summe der vier Prüfungsergebnisse × 5 = ${T.b2}${T.done ? '' : '; fehlende Prüfungen ersetzt durch den Block-I-Durchschnitt ' + R(r.avg)}.<br>Abinote = max(1,0 ; (1020 − ${T.G}) ÷ 18 abgerundet, in Zehnteln).<br>Eingebracht werden Pflichtkurse und die Wahlkurse mit dem besten Durchschnitt.${out.length ? '<br>Nicht eingebracht: ' + out.map(esc).join(', ') + '.' : ''}</p></details></div>
 <small class=d>Berechnete Kursnoten sind vorläufig. Verbindlich ist die Note, die die Lehrkraft festlegt. Alle Angaben ohne Gewähr.</small>`;
}
function qtab(i) {
  const r = solve(),
    cs = courses().filter((c) => c.i == i || (c.t == 'B' && i < 2)),
    a = wm(cs.map((c) => ({ ...c, ...pts(c) })).filter((c) => c.p != null));
  return (
    `<div class=g><small>Halbjahresschnitt ${SEM[i]}</small><div class="big mono" style="font-size:34px">${gn(a)}</div><small>${a == null ? '' : f1(a) + ' Punkte'}</small></div>` +
    (cs.length
      ? cs
          .map((c) => {
            const p = pts(c),
              tg =
                c.t == 'B' || !r
                  ? ''
                  : r.must.has(c.k)
                    ? 'Pflicht'
                    : r.keys.has(c.k)
                      ? 'zählt'
                      : p.p != null
                        ? 'gestrichen'
                        : '';
            return `<div class="g row" data-e="${c.k}" tabindex=0><div><b>${esc(nm(c))}</b><span class="tg d">${c.t == 'B' ? 'Q1' : c.t}</span><br><small class="${tg}">${tg}</small></div><div class="pt ${p.fin ? 'f' : 'v'}">${p.p == null ? '–' : p.p}<small>${p.p == null ? '' : NT[p.p]}</small></div></div>`;
          })
          .join('')
      : '<div class=g>Keine Kurse in diesem Halbjahr.</div>') +
    `<small class=d>Grau = vorläufig berechnet, blau = Endnote.</small>`
  );
}
function ab() {
  const ex = exams();
  return ex
    .map((e) => {
      const x = st.x[e.n] || {};
      return (
        `<div class=g><h2>Abiturfach ${e.n}: ${e.id ? esc(NM[e.id]) : 'nicht gewählt'}</h2>` +
        (e.n < 4
          ? `<h4>Schriftlich (Punkte)</h4><input type=number min=0 max=15 data-x="${e.n}.s" value="${x.s ?? ''}"><h4>Mündliche Zusatzprüfung (optional)</h4><input type=number min=0 max=15 data-x="${e.n}.m" value="${x.m ?? ''}">`
          : `<h4>Mündlich (Punkte)</h4><input type=number min=0 max=15 data-x="4.s" value="${x.s ?? ''}">`) +
        `<small>Ergebnis: ${e.e == null ? '–' : e.e + ' Punkte'}</small></div>`
      );
    })
    .join('');
}
