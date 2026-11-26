function render() {
  if (!st) return wiz();
  // Ansicht für das Layout auf großen Bildschirmen (style.css, Abschnitt „iPad und Mac“); auf dem Handy ohne Wirkung
  $('#app').dataset.view = tab == 'un' || tab == 'kp' || tab == 'ov' || tab == 'ab' ? tab : 'q';
  const top = `<div class=top>${UntisUI.head(tab)}<button class=bt data-a=menu aria-label=Menü>⋯</button></div>`;
  if (tab == 'un' || tab == 'kp') {
    // Untis-Planer und Klausuren (untis-ui.js)
    $('#app').innerHTML = top + UntisUI.view();
    Motion.show(UntisUI.key());
    return;
  }
  const tabs = [
    ['ov', 'Übersicht'],
    ...SEM.map((s, i) => [i, s]),
    ['ab', 'Abitur'],
  ];
  $('#app').innerHTML =
    top + `<nav class=tabs>${tabs.map(([k, l]) => `<button data-t="${k}" class="${k == tab ? 'on' : ''}">${l}</button>`).join('')}</nav>` +
    (tab == 'ov' ? ov() : tab == 'ab' ? ab() : qtab(+tab));
  Motion.show('a:' + tab);
}
// Hinweis für Stände ohne Abiturjahrgang (eingerichtet vor dieser Abfrage): Sie rechnen nach der bisherigen APO-GOSt.
const yrCard = () =>
  st.y
    ? ''
    : `<div class=g><h2>In welchem Jahr machst du Abitur?</h2><p class=d>Ab dem Abitur ${NEU_AB} gilt in NRW eine neue Prüfungsordnung mit fünf Abiturfächern, Projektkurs in der Q2 und anderer Rechenweise. Bis du deinen Jahrgang angibst, rechnet der Rechner nach den bisherigen Regeln (Abitur bis ${NEU_AB - 1}).</p><div class=bar><button class="bt pr" data-a=yr>Abiturjahr angeben</button></div></div>`;
// Ab dem Abitur 2030 ist die Rechnung neu (APO-GOSt (2027) gilt erst ab 01.08.2027): deutlich als Beta kennzeichnen.
const BETA = '<span class=beta>Beta</span>',
  betaCard = () =>
    `<div class="g betabox"><h2>${BETA} Rechnung ab dem Abitur ${NEU_AB}</h2><p class=d>Noch ohne Erfahrung aus echten Jahrgängen. Ergebnisse bitte mit der Oberstufenkoordination abgleichen.</p></div>`;
// Welche Prüfungsordnung gerade gilt (für Übersicht und Rechenweise)
const apoTx = () =>
  isNeu(st)
    ? 'APO-GOSt (2027), gilt ab dem Abitur ' + NEU_AB
    : 'APO-GOSt in der bis zum Abitur ' + (NEU_AB - 1) + ' geltenden Fassung' + (st.y >= NEU_AB ? ' (Q1 vor 2028/29 begonnen)' : '');
function ov() {
  const r = solve();
  if (!r)
    return (
      yrCard() +
      '<div class=g><h2>Noch keine Noten</h2><p class=d>Wähle oben ein Halbjahr und tippe auf einen Kurs, um Noten einzutragen.</p></div>'
    );
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
      FN(id),
      a.reduce((x, y) => x + y, 0) / a.length,
    ]),
    // Pflicht, frei wählbar, gewählt
    free = r.items.filter((c) => c.p > 0 && c.t != 'B' && !r.must.has(c.k)),
    chosen = free.filter((c) => r.keys.has(c.k)).length,
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
    nmEst = (c) => esc(cname(c)) + (c.est ? ' (Prognose)' : ''),
    nu = r.nu,
    cntTx = nu ? 'genau ' + RULE27.n : RULE.min + ' bis ' + RULE.max,
    tail = `${out.length ? '<br>Nicht eingebracht: ' + out.map(nmEst).join(', ') + '.' : ''}${zero.length ? '<br>Mit 0 Punkten (gilt als nicht belegt, nicht anrechenbar): ' + zero.map((c) => esc(cname(c))).join(', ') + '.' : ''}`,
    asgTx = asg.length ? '<br>Zugeordnet: ' + asg.map(esc).join(', ') + '. Das lässt sich im Menü unter „Fächer und Abiturfächer ändern“ festlegen.' : '',
    // Rechenweise: bis Abitur 2029 unverändert, ab 2030 nach APO-GOSt (2027)
    how = nu
      ? `Grundlage: ${apoTx()}.<br>Block I = Punkte ÷ 44 × 40 (8 Leistungskurse doppelt, 28 weitere Kurse einfach): ${r.P} ÷ ${r.N} × 40 = ${r.b1} (${r.cnt} eingebrachte Kurse).<br>Pflicht sind ${r.must.size} Kurse (fünf Abiturfächer, ${FN('pk')}, Deutsch, Mathematik, Fremdsprache, Naturwissenschaft, Gesellschaftswissenschaft samt Zusatzkursen, Religion, Kunst/Musik, Schwerpunktfach). Dazu kommen ${free.length} frei wählbare Kurse; es zählen genau ${RULE27.n}. Von den wählbaren zählen genau die, mit denen der Schnitt am besten wird (${chosen} Stück).${asgTx}${r.ref5 ? '<br>Dein 5. Abiturfach ist das Referenzfach deines ' + (st.pj.type == 'ac' ? 'Advanced Class' : 'Projektkurses') + ': Davon zählen die beiden Q1-Kurse, dazu die zwei Halbjahre ' + (st.pj.type == 'ac' ? 'der Advanced Class' : 'des Projektkurses') + '.' : ''}${st.bll && r.a5 ? '<br>Mit Besonderer Lernleistung muss dein 5. Abiturfach nicht mit vier Kursen eingebracht werden.' : ''}<br>Belegt sein müssen genau ${RULE27.belegt} Kurse; Vertiefungskurse zählen mit, Kurse mit 0 Punkten nicht.<br>Block II = Summe der fünf Prüfungsergebnisse × 4 = ${T.b2}${T.done ? '' : '; fehlende Prüfungen sind mit deinem Schnitt im jeweiligen Prüfungsfach angesetzt'}. Mit mündlicher Zusatzprüfung im 1. bis 3. Fach zählt schriftlich doppelt: (2 × schriftlich + mündlich) ÷ 3 × 4, erst dann gerundet.<br>Abinote = max(1,0 ; (1020 − ${T.G}) ÷ 18 abgerundet, in Zehnteln).${tail}`
      : `Block I = Punkte ÷ Kurse × 40, Leistungskurse doppelt: ${r.P} ÷ ${r.N} × 40 = ${r.b1} (${r.cnt} eingebrachte Kurse).<br>Pflicht sind ${r.must.size} Kurse (Abiturfächer, Deutsch, Mathematik, Fremdsprache, Naturwissenschaft, Gesellschaftswissenschaft samt Zusatzkursen, Religion, Kunst/Musik, Schwerpunktfach). Dazu kommen ${free.length} frei wählbare Kurse; es müssen insgesamt ${RULE.min} bis ${RULE.max} zählen. Von den wählbaren zählen genau die, mit denen der Schnitt am besten wird (${chosen} Stück).${asgTx}${Object.keys(st.sp).length ? '<br>Projektkurs bzw. Advanced Class ist freiwillig und zählt nur, wenn er den Schnitt verbessert (dann als zwei Kurse).' : ''}<br>Block II = Summe der vier Prüfungsergebnisse × 5 = ${T.b2}${T.done ? '' : '; fehlende Prüfungen sind mit deinem Schnitt im jeweiligen Prüfungsfach angesetzt'}. Mit mündlicher Zusatzprüfung zählt schriftlich doppelt: (2 × schriftlich + mündlich) ÷ 3 × 5, erst dann gerundet.<br>Abinote = max(1,0 ; (1020 − ${T.G}) ÷ 18 abgerundet, in Zehnteln).${tail}${st.y ? '<br>Grundlage: ' + apoTx() + '.' : ''}`,
    // Belegung: bis 2029 mindestens 38 anrechenbare Kurse, ab 2030 genau 40 belegte (mit Vertiefungskursen)
    bel = nu
      ? ck(
          `Belegte Kurse: ${r.nbel} (genau ${RULE27.belegt}${st.vk ? ', davon ' + st.vk + ' Vertiefungskurse' : ''})${r.nbel > RULE27.belegt ? '<br><small>Mehr als vorgesehen: Prüfe die Tabelle unter „Fächer und Abiturfächer ändern“.</small>' : ''}`,
          r.nbel == RULE27.belegt ? 'ok' : r.belegtOk ? '' : 'no',
        )
      : ck(`Anrechenbare Kurse belegt: ${r.ntot} (mindestens ${RULE.belegt})`, r.belegtOk ? 'ok' : 'no'),
    exTx = nu
      ? `Drei Prüfungsfächer mit mind. 5 Punkten (je ${RULE27.min} in Block II), darunter ein Leistungskurs`
      : 'Zwei Prüfungsfächer mit mind. 5 Punkten, davon ein Leistungskurs';
  return `${yrCard()}<div class="g hero"><div class=d>${T.fin ? 'Endergebnis' : 'Hochrechnung'}</div><div class="big mono">${grade(T.G)}</div>${trend()}<div class=d>${T.G} von 900 Punkten · Block I ${r.b1} · Block II ${T.b2}${pf}</div>
 <div class=prog><i style="width:${Math.round((nf / cs.length) * 100)}%"></i></div><small>${nf} von ${cs.length} Kursen mit Endnote</small></div>${nu ? betaCard() : ''}
 <div class="g ov-ck"><h2>Zulassungs-Check</h2><ul>${ck(r.viol.length ? `Pflichtbelegung nicht erfüllt:<br><small>${r.viol.map(esc).join('<br>')}</small>` : 'Pflichtbelegung erfüllt', r.viol.length ? 'no' : 'ok')}
 ${bel}${ck(`Eingebrachte Kurse: ${r.cnt} (${cntTx})`, r.cntOk ? 'ok' : 'no')}
 ${ck(`Defizite: ${r.d} (max. ${r.defMax}), davon Leistungskurs ${r.ld} (max. ${nu ? RULE27.defLK : RULE.defLK})`, r.defOk ? 'ok' : 'no')}${ck(`Block I mindestens 200: ${r.b1}`, r.b1 >= 200 ? 'ok' : 'no')}
 ${ck(`Block II mindestens 100: ${T.b2}${pf}`, !T.done ? '' : T.b2 >= 100 ? 'ok' : 'no')}${ck(`${exTx}${pf}`, !T.done ? '' : T.nx ? 'ok' : 'no')}
 ${ck(`Gesamt mindestens 300: ${T.G}${pf}`, !T.fin ? '' : T.pass ? 'ok' : 'no')}</ul></div>
 <div class="g ov-sn"><h2>Halbjahresschnitte</h2>${hs.map(([l, a]) => `<div class=ir><span style="flex:1">${l}</span><b class=mono>${av(a)}</b></div>`).join('')}<h4>Fachschnitte</h4>${fs.map(([l, a]) => `<div class=ir><span style="flex:1">${esc(l)}</span><b class=mono>${av(a)}</b></div>`).join('')}</div>
 <div class=g><details><summary>Rechenweise</summary><p class=d style="margin-top:8px">${how}</p></details></div>
 <small class=d>Alle Angaben ohne Gewähr.</small>`;
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
            return `<div class="g row" data-e="${c.k}" tabindex=0><div><b>${esc(nm(c))}</b><span class="tg d">${c.t == 'B' ? 'Q1' : c.t == 'PK' && st.pj && st.pj.type == 'ac' ? 'AC' : c.t}</span><br><small class="${cl}">${tx}</small></div><div class="pt ${p.fin ? 'f' : 'v'}">${p.p == null ? '–' : p.p}<small>${p.p == null ? '' : NT[p.p]}</small></div></div>`;
          })
          .join('')
      : '<div class=g>Keine Kurse in diesem Halbjahr.</div>') +
    `<small class=d>Grau = vorläufig berechnet, blau = Endnote.</small>`
  );
}
function ab() {
  const ex = exams(),
    r = solve(),
    nu = isNeu(st),
    pn = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ','));
  return (
    ex
      .map((e) => {
        const x = st.x[e.n] || {},
          res =
            e.e != null
              ? pn(e.e) + ' Punkte, in Block II ' + e.eb
              : r
                ? '– (Prognose aus deinem Fachschnitt: ' + guess(r, e.id, e.n) + ' Punkte)'
                : '–',
          // 5. Fach (ab 2030): Präsentationsprüfung (§ 35) oder Besondere Lernleistung mit Kolloquium (§ 36)
          art5 = st.bll ? 'Besondere Lernleistung' : 'Präsentationsprüfung';
        return (
          `<div class=g><h2>Abiturfach ${e.n}: ${e.id ? esc(NM[e.id]) : 'nicht gewählt'}${e.n == 5 ? ' (' + art5 + ')' : ''}</h2>` +
          (e.n < 4
            ? `<h4>Schriftlich (Punkte)</h4><input type=number min=0 max=15 data-x="${e.n}.s" value="${x.s ?? ''}"><h4>Mündliche Zusatzprüfung (optional)</h4><input type=number min=0 max=15 data-x="${e.n}.m" value="${x.m ?? ''}">`
            : `<h4>${e.n == 5 ? (st.bll ? 'Besondere Lernleistung: Arbeit und Kolloquium' : 'Präsentationsprüfung') : 'Mündlich'} (Punkte)</h4><input type=number min=0 max=15 data-x="${e.n}.s" value="${x.s ?? ''}">`) +
          `<small>Ergebnis: ${res}</small></div>`
        );
      })
      .join('') +
    (nu
      ? `<small class=d>${BETA} Ab dem Abitur ${NEU_AB} zählt jede der fünf Prüfungen vierfach (höchstens 300 Punkte). Bestanden ist Block II mit mindestens 100 Punkten und mindestens 20 Punkten in drei Prüfungsfächern, darunter einem Leistungskurs.</small>`
      : '')
  );
}
