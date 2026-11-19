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
  if (record(T.G)) save();
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
    // Pflicht, frei wählbar, gewählt
    free = r.items.filter((c) => c.p > 0 && c.t != 'B' && !r.must.has(c.k)),
    chosen = free.filter((c) => r.keys.has(c.k)).length,
    bz = r.set.filter((c) => c.t == 'B'),
    out = r.items.filter((c) => c.p > 0 && !r.keys.has(c.k)),
    zero = r.items.filter((c) => c.p <= 0),
    a = r.asg,
    asg = [
      ['Fremdsprache', a.fs],
      ['Naturwissenschaft', a.nw],
      ['Gesellschaftswissenschaft', a.gw],
      ['Schwerpunktfach', a.sf],
    ]
      .filter(([, id]) => id)
      .map(([l, id]) => l + ' ' + NM[id]),
    nmEst = (c) => esc(cname(c)) + (c.est ? ' (Prognose)' : '');
  return `<div class="g hero"><div class=d>${T.fin ? 'Endergebnis' : 'Hochrechnung'}</div><div class="big mono">${grade(T.G)}</div>${trend()}<div class=d>${T.G} von 900 Punkten · Block I ${r.b1} · Block II ${T.b2}${pf}</div>
 <div class=prog><i style="width:${Math.round((nf / cs.length) * 100)}%"></i></div><small>${nf} von ${cs.length} Kursen mit Endnote</small>
 <br><small>Eingebracht: ${r.cnt} Kurse (${RULE.min} bis ${RULE.max}), davon ${r.must.size} Pflicht und ${chosen} von ${free.length} wählbaren${bz.length ? ' + ' + bz.map((c) => esc(SP[c.sp])).join(', ') : ''}</small>${r.est ? `<br><small>${r.est} Kurse ohne Note sind mit dem Schnitt ihres Fachs angesetzt.</small>` : ''}</div>
 <div class=g><h2>Zulassungs-Check</h2><ul>${ck(r.viol.length ? `Pflichtbelegung nicht erfüllt:<br><small>${r.viol.map(esc).join('<br>')}</small>` : 'Pflichtbelegung erfüllt', r.viol.length ? 'no' : 'ok')}
 ${ck(`Anrechenbare Kurse belegt: ${r.ntot} (mindestens ${RULE.belegt})`, r.belegtOk ? 'ok' : 'no')}${ck(`Eingebrachte Kurse: ${r.cnt} (${RULE.min} bis ${RULE.max})`, r.cntOk ? 'ok' : 'no')}
 ${ck(`Defizite: ${r.d} (max. ${r.defMax}), davon Leistungskurs ${r.ld} (max. ${RULE.defLK})`, r.defOk ? 'ok' : 'no')}${ck(`Block I mindestens 200: ${r.b1}`, r.b1 >= 200 ? 'ok' : 'no')}
 ${ck(`Block II mindestens 100: ${T.b2}${pf}`, !T.done ? '' : T.b2 >= 100 ? 'ok' : 'no')}${ck(`Zwei Prüfungsfächer mit mind. 5 Punkten, davon ein Leistungskurs${pf}`, !T.done ? '' : T.n5 ? 'ok' : 'no')}
 ${ck(`Gesamt mindestens 300: ${T.G}${pf}`, !T.fin ? '' : T.pass ? 'ok' : 'no')}</ul></div>
 <div class=g><h2>Halbjahresschnitte</h2>${hs.map(([l, a]) => `<div class=ir><span style="flex:1">${l}</span><b class=mono>${av(a)}</b></div>`).join('')}<h4>Fachschnitte</h4>${fs.map(([l, a]) => `<div class=ir><span style="flex:1">${esc(l)}</span><b class=mono>${av(a)}</b></div>`).join('')}</div>
 <div class=g><details><summary>Rechenweise</summary><p class=d style="margin-top:8px">Block I = Punkte ÷ Kurse × 40, Leistungskurse doppelt: ${r.P} ÷ ${r.N} × 40 = ${r.b1} (${r.cnt} eingebrachte Kurse).<br>Pflicht sind ${r.must.size} Kurse (Abiturfächer, Deutsch, Mathematik, Fremdsprache, Naturwissenschaft, Gesellschaftswissenschaft samt Zusatzkursen, Religion, Kunst/Musik, Schwerpunktfach). Dazu kommen ${free.length} frei wählbare Kurse; es müssen insgesamt ${RULE.min} bis ${RULE.max} zählen. Von den wählbaren zählen genau die, mit denen der Schnitt am besten wird (${chosen} Stück).${asg.length ? '<br>Zugeordnet: ' + asg.map(esc).join(', ') + '. Das lässt sich im Menü unter „Fächer und Abiturfächer ändern“ festlegen.' : ''}${Object.keys(st.sp).length ? '<br>Projektkurs bzw. Advanced Class ist freiwillig und zählt nur, wenn er den Schnitt verbessert (dann als zwei Kurse).' : ''}<br>Block II = Summe der vier Prüfungsergebnisse × 5 = ${T.b2}${T.done ? '' : '; fehlende Prüfungen sind mit deinem Schnitt im jeweiligen Prüfungsfach angesetzt'}. Mit mündlicher Zusatzprüfung zählt schriftlich doppelt: (2 × schriftlich + mündlich) ÷ 3 × 5, erst dann gerundet.<br>Abinote = max(1,0 ; (1020 − ${T.G}) ÷ 18 abgerundet, in Zehnteln).${out.length ? '<br>Nicht eingebracht: ' + out.map(nmEst).join(', ') + '.' : ''}${zero.length ? '<br>Mit 0 Punkten (gilt als nicht belegt, nicht anrechenbar): ' + zero.map((c) => esc(cname(c))).join(', ') + '.' : ''}</p></details></div>
 <small class=d>Berechnete Kursnoten sind vorläufig. Verbindlich ist die Note, die die Lehrkraft festlegt. Alle Angaben ohne Gewähr.</small>`;
}
function qtab(i) {
  const r = solve(),
    cs = courses().filter((c) => c.i == i || (c.t == 'B' && i < 2)),
    a = wm(cs.map((c) => ({ ...c, ...pts(c) })).filter((c) => c.p != null));
  const tag = (c, p) => {
    if (!r) return ['', ''];
    if (p.p === 0) return ['gestrichen', '0 Punkte: nicht anrechenbar'];
    if (c.t == 'B')
      return r.keys.has(c.k)
        ? ['zählt', 'freiwillig: zählt']
        : p.p != null
          ? ['gestrichen', 'freiwillig: nicht eingebracht']
          : ['wählbar', 'freiwillig'];
    if (r.must.has(c.k)) return ['Pflicht', 'Pflicht'];
    if (p.p == null)
      return r.keys.has(c.k)
        ? ['wählbar', 'wählbar: zählt voraussichtlich']
        : ['wählbar', 'wählbar: voraussichtlich gestrichen'];
    return r.keys.has(c.k) ? ['zählt', 'zählt'] : ['gestrichen', 'gestrichen'];
  };
  return (
    `<div class=g><small>Halbjahresschnitt ${SEM[i]}</small><div class="big mono" style="font-size:34px">${gn(a)}</div><small>${a == null ? '' : f1(a) + ' Punkte'}</small></div>` +
    (cs.length
      ? cs
          .map((c) => {
            const p = pts(c),
              [cl, tx] = tag(c, p);
            return `<div class="g row" data-e="${c.k}" tabindex=0><div><b>${esc(nm(c))}</b><span class="tg d">${c.t == 'B' ? 'Q1' : c.t}</span><br><small class="${cl}">${tx}</small></div><div class="pt ${p.fin ? 'f' : 'v'}">${p.p == null ? '–' : p.p}<small>${p.p == null ? '' : NT[p.p]}</small></div></div>`;
          })
          .join('')
      : '<div class=g>Keine Kurse in diesem Halbjahr.</div>') +
    `<small class=d>Grau = vorläufig berechnet, blau = Endnote.</small>`
  );
}
function ab() {
  const ex = exams(),
    r = solve(),
    pn = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ','));
  return ex
    .map((e) => {
      const x = st.x[e.n] || {},
        res =
          e.e != null
            ? pn(e.e) + ' Punkte, in Block II ' + e.e5
            : r
              ? '– (Prognose aus deinem Fachschnitt: ' + guess(r, e.id) + ' Punkte)'
              : '–';
      return (
        `<div class=g><h2>Abiturfach ${e.n}: ${e.id ? esc(NM[e.id]) : 'nicht gewählt'}</h2>` +
        (e.n < 4
          ? `<h4>Schriftlich (Punkte)</h4><input type=number min=0 max=15 data-x="${e.n}.s" value="${x.s ?? ''}"><h4>Mündliche Zusatzprüfung (optional)</h4><input type=number min=0 max=15 data-x="${e.n}.m" value="${x.m ?? ''}">`
          : `<h4>Mündlich (Punkte)</h4><input type=number min=0 max=15 data-x="4.s" value="${x.s ?? ''}">`) +
        `<small>Ergebnis: ${res}</small></div>`
      );
    })
    .join('');
}
