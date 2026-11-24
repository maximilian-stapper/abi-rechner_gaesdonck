// Fächer des Rechners; ab dem Abitur 2030 kommt der Projektkurs (Q2, Pflicht) als eigene Zeile dazu.
const subs = () => (isNeu(st) ? [...S, ['pk', 'Projektkurs']] : S);
function courses() {
  const a = [];
  for (const [id] of subs())
    (st.cells[id] || []).forEach((t, i) => {
      if (t) a.push({ k: id + '.' + i, id, i, t });
    });
  // Bis zum Abitur 2029: Projektkurs bzw. Advanced Class in Q1, eine Note (Ende Q1.2), freiwillig einzubringen.
  // Ab 2030 gibt es das nicht mehr; der Projektkurs liegt dann in der Q2 und steht oben in den Zellen (pk.2, pk.3).
  if (!isNeu(st))
    for (const type of Object.keys(SP))
      if (st.sp[type])
        a.push({ k: 'sp_' + type, id: 'sp_' + type, sp: type, i: -1, t: 'B' });
  return a;
}
const nm = (c) =>
  c.t == 'B'
    ? SP[c.sp] + (st.sp[c.sp].name ? ': ' + st.sp[c.sp].name : '')
    : c.id == 'pk' && st.pj && st.pj.name
      ? FN('pk') + ': ' + st.pj.name
      : FN(c.id);
// Name mit Halbjahr, z. B. „Chemie Q2.1"
const cname = (c) => (c.t == 'B' ? nm(c) : FN(c.id) + ' ' + SEM[c.i]);
function pts(c) {
  const g = st.g[c.k] || {};
  if (g.f !== undefined && g.f !== null && g.f !== '')
    return { p: +g.f, fin: 1 };
  const m = (g.m || []).filter((r) => num(r.n) != null),
    // Gewicht: leer = 1, 0 bleibt 0 (Note wird dann nicht berücksichtigt)
    wt = (r) => {
      const w = r.w === '' || r.w == null ? 1 : +r.w;
      return isFinite(w) && w >= 0 ? w : 1;
    },
    sw = m.reduce((a, r) => a + wt(r), 0),
    s = (g.s || []).filter((v) => num(v) != null);
  const o = m.length
      ? sw > 0
        ? m.reduce((a, r) => a + r.n * wt(r), 0) / sw
        : m.reduce((a, r) => a + +r.n, 0) / m.length
      : null,
    w = s.length ? s.reduce((a, v) => a + +v, 0) / s.length : null;
  // Kurse mit schriftlichen Arbeiten: „Schriftliche Arbeiten“ und „Sonstige Mitarbeit“ gleichwertig (§ 13 Abs. 1).
  // Im Projektkurs (ab 2030) ist die schriftliche Arbeit das Produkt des Halbjahres (§ 14 Abs. 1 und 3).
  const p =
    o == null ? w : w == null ? o : c.t == 'S' || c.t == 'LK' || c.t == 'PK' ? (o + w) / 2 : o;
  return { p: p == null ? null : R(p), fin: 0 };
}

// ---------------------------------------------------------------------------
// Alle Kurse mit Punkten. Kurse ohne Note bekommen für die Hochrechnung den
// Schnitt ihres Fachs (gibt es dort noch nichts, den Gesamtschnitt). So weiß die
// Rechnung von Anfang an, wie viele Kurse es gibt und wie viele davon zählen
// müssen und können. Ein Projektkurs usw. ohne Note ist freiwillig und fällt weg.
// est = 1 markiert solche angesetzten Kurse.
// ---------------------------------------------------------------------------
function items() {
  const all = courses().map((c) => ({ ...c, ...pts(c) })),
    real = all.filter((c) => c.p != null);
  if (!real.length) return null;
  const mean = (a) => a.reduce((x, c) => x + c.p, 0) / a.length,
    reg = real.filter((c) => c.t != 'B'),
    total = mean(reg.length ? reg : real),
    sub = {};
  reg.forEach((c) => (sub[c.id] = sub[c.id] || []).push(c));
  return all
    .map((c) => {
      if (c.p != null) return { ...c, est: 0 };
      if (c.t == 'B') return null;
      return { ...c, p: Math.max(1, R(sub[c.id] ? mean(sub[c.id]) : total)), est: 1 };
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Block I (APO-GOSt NRW, § 11, § 28, § 29; Fassung ab 01.08.2025)
//
// Was zählen MUSS (§ 28 Abs. 2 bis 6, jeweils nur Kurse mit mindestens 1 Punkt):
//  - alle 4 Kurse der vier Abiturfächer
//  - Deutsch und Mathematik, je 4 Kurse
//  - eine durchgehend belegte Fremdsprache und eine durchgehend belegte Naturwissenschaft (je 4 Kurse)
//  - eine durchgehend belegte Gesellschaftswissenschaft (4 Kurse) plus je 2 Kurse in Geschichte und
//    Sozialwissenschaften (Zusatzkurse), soweit das nicht schon dieses Fach ist
//  - Religionslehre: 2 Kurse
//  - Kunst oder Musik: 2 aufeinanderfolgende Kurse, ersatzweise 2 Literaturkurse
//  - Schwerpunktfach (9. Pflichtfach, § 8 Abs. 2, § 11 Abs. 5, § 28 Abs. 6: weitere Fremdsprache oder weiteres
//    MINT-Fach): die 2 Kurse aus Q2. Ist es eine Naturwissenschaft, darf es mit der Naturwissenschaft tauschen
//    (VV 28.3.1). Fehlt es, ist die Belegpflicht verletzt.
//  - Spanisch ab EF ist normalerweise ein Fach wie jedes andere (Fremdsprache, Schwerpunktfach oder frei).
//    Nur wer in der Sek. I keine zweite Fremdsprache hatte (st.nz2), muss es einbringen: die 2 Q2-Kurse, wenn eine
//    andere Fremdsprache durchgeht (§ 28 Abs. 4), sonst alle 4 Kurse als Fremdsprache (§ 28 Abs. 5).
// Was NICHT Pflicht ist: Sport, alle übrigen Kurse und Projektkurs/Advanced Class.
// Ein Kurs mit 0 Punkten gilt als nicht belegt (§ 6 Abs. 7, § 28 Abs. 1): er ist nicht anrechenbar, und eine
// Pflichtbedingung, die ihn braucht, ist nicht erfüllt. Gibt es zur Erfüllung ein anderes Fach, wird das gewählt.
// Außerdem: 35 bis 40 Kurse, Defizit-Grenzen, höchstens 2 Literaturkurse.
//
// Wo die Fächer nicht eindeutig sind (zwei Fremdsprachen, zwei Naturwissenschaften ...), werden ALLE zulässigen
// Zuordnungen durchprobiert (oder die in der Einrichtung festgelegte genommen). Zu jeder Zuordnung steht damit
// die Pflichtmenge fest. Den Rest füllt eine exakte Auswahl auf: Kurse in der Reihenfolge ihrer Punkte, für jede
// zulässige Gesamtzahl, danach gewinnt der beste Schnitt.
//
// Ab dem Abitur 2030 (APO-GOSt (2027), § 26, § 27) ist die Pflichtmenge fast gleich (§ 26 Abs. 3 bis 7 entsprechen
// § 28 Abs. 3 bis 8 alt, VV 26.3.1 der VV 28.3.1). Anders ist:
//  - fünf Abiturfächer mit je 4 Kursen (§ 26 Abs. 2). Ist das 5. Abiturfach das Referenzfach des Projektkurses,
//    zählen davon nur die beiden Q1-Kurse (dazu die zwei Projektkurs-Halbjahre). Mit Besonderer Lernleistung im
//    5. Fach entfällt die Pflicht, dieses Fach mit 4 Kursen einzubringen.
//  - der Projektkurs (Q2.1 und Q2.2) ist Pflicht und zählt immer mit beiden Halbjahresergebnissen (§ 26 Abs. 3).
//    An der Gaesdonck kann eine Advanced Class an seine Stelle treten; sie wird genauso gerechnet.
//  - es zählen genau 36 Kurse (8 LK + 28 weitere), höchstens 7 Defizite, davon höchstens 3 LK; 40 Kurse belegt.
// ---------------------------------------------------------------------------
function solve() {
  const C = items();
  if (!C) return null;
  const I = {};
  C.forEach((c) => (I[c.k] = c));
  const nu = isNeu(st), // Abitur ab 2030
    a5 = nu ? (S.find(([id]) => st.af[id] == 5) || [])[0] : undefined, // 5. Abiturfach
    ref = nu && st.pj ? st.pj.ref : undefined, // Referenzfach des Projektkurses
    ref5 = nu && !st.bll && !!a5 && a5 == ref, // 5. Abiturfach = Referenzfach (§ 26 Abs. 2 Satz 2)
    skip5 = nu && !!a5 && (!!st.bll || ref5); // 5. Abiturfach muss nicht mit allen 4 Kursen zählen
  const ce = (id) => st.cells[id] || [],
    ks = (id) => [0, 1, 2, 3].filter((i) => ce(id)[i]).map((i) => id + '.' + i),
    ok = (k) => !!I[k] && I[k].p > 0, // anrechenbar (mindestens 1 Punkt)
    aks = (id) => ks(id).filter(ok),
    full = (id) => aks(id).length == 4,
    // Fach, dessen Kurse ohnehin alle zählen: Leistungskurs oder Abiturfach (ab 2030 ohne die Sonderfälle im 5. Fach)
    top = (id) => ce(id).includes('LK') || (st.af[id] > 0 && !(skip5 && id == a5)),
    byP = (a, b) => I[b].p - I[a].p,
    nz2 = !!st.nz2, // keine zweite Fremdsprache in der Sek. I (§ 28 Abs. 4 und 5)
    pf = {};
  for (const [key, id] of Object.entries(st.pf || {})) if (id && ks(id).length) pf[key] = id;

  // --- Kandidaten für die Pflichtbedingungen -------------------------------
  const one = (list) => {
      const f = list.filter(full),
        t = f.filter(top);
      return t.length ? [t[0]] : f.length ? f : [undefined];
    },
    // Ein Fach, das ohnehin komplett zählt (LK/Abiturfach), ist immer die günstigste Wahl.
    // Ein festgelegtes Schwerpunktfach ist eine *weitere* Fremdsprache bzw. ein *weiteres* MINT-Fach (§ 8 Abs. 2),
    // kann also nicht zugleich die Fremdsprache oder die Naturwissenschaft sein.
    fsC = pf.fs ? [pf.fs] : one(FS.filter((id) => id != pf.sf)),
    nwC = pf.nw ? [pf.nw] : one(NW.filter((id) => id != pf.sf)),
    gwC = pf.gw ? [pf.gw] : one(GW),
    sfC = (fs, nw) => {
      if (pf.sf) return [pf.sf];
      if (nz2 && fs != 'es' && ks('es').length) return ['es'];
      return one(SF.filter((id) => id != fs && id != nw));
    };

  // --- Pflichtmenge zu einer Zuordnung -------------------------------------
  const build = (a) => {
    const must = new Set(),
      viol = new Set(),
      lab = (id, l) => (l ? l + ' ' : '') + NM[id],
      chk = (id, l) => {
        for (let i = 0; i < 4; i++) {
          if (!ce(id)[i]) viol.add(lab(id, l) + ' ' + SEM[i] + ': nicht belegt');
          else if (!ok(id + '.' + i))
            viol.add(lab(id, l) + ' ' + SEM[i] + ': 0 Punkte, gilt als nicht belegt');
        }
      },
      all = (id, l) => {
        chk(id, l);
        aks(id).forEach((k) => must.add(k));
      },
      two = (id) => {
        const need = 2 - ks(id).filter((k) => must.has(k)).length;
        if (need <= 0) return;
        const c = aks(id)
          .filter((k) => !must.has(k))
          .sort(byP);
        c.slice(0, need).forEach((k) => must.add(k));
        if (c.length < need) viol.add(NM[id] + ': mindestens 2 Kurse mit Punkten nötig');
      };
    S.forEach(([id]) => top(id) && all(id, 'Abiturfach'));
    // Halbjahre i eines Fachs: müssen belegt sein und mindestens 1 Punkt haben, dann zählen sie
    const need = (id, l, is) =>
      is.forEach((i) => {
        const k = id + '.' + i;
        if (!ce(id)[i]) viol.add(l + ' ' + SEM[i] + ': nicht belegt');
        else if (!ok(k)) viol.add(l + ' ' + SEM[i] + ': 0 Punkte, gilt als nicht belegt');
        else must.add(k);
      });
    if (ref5) need(a5, '5. Abiturfach (Referenzfach) ' + NM[a5], [0, 1]);
    if (nu) need('pk', FN('pk'), [2, 3]);
    ['de', 'ma'].forEach((id) => top(id) || all(id));
    [
      [a.fs, 'Fremdsprache'],
      [a.nw, 'Naturwissenschaft'],
      [a.gw, 'Gesellschaftswissenschaft'],
    ].forEach(([id, l]) => {
      if (id === undefined) viol.add('Kein durchgehend belegtes Fach: ' + l);
      else top(id) || all(id, l);
    });
    S.forEach(([id]) =>
      ce(id).forEach((t, i) => {
        if (t != 'ZK') return;
        if (ok(id + '.' + i)) must.add(id + '.' + i);
        else viol.add(NM[id] + ' ' + SEM[i] + ' (Zusatzkurs): 0 Punkte, gilt als nicht belegt');
      }),
    );
    ['ge', 'sw'].forEach(two);
    two('re');
    if (a.sf && (a.sf == a.fs || a.sf == a.nw))
      viol.add('Schwerpunktfach ' + NM[a.sf] + ': muss ein anderes Fach sein als die Fremdsprache bzw. die Naturwissenschaft');
    if (a.sf) {
      top(a.sf) || chk(a.sf, 'Schwerpunktfach');
      [2, 3].forEach((i) => ok(a.sf + '.' + i) && must.add(a.sf + '.' + i));
    } else
      viol.add(
        'Kein Schwerpunktfach (9. Pflichtfach): eine weitere Fremdsprache oder ein weiteres MINT-Fach muss bis Q2.2 belegt sein',
      );
    ks('sp').forEach(
      (k) => ok(k) || viol.add('Sport ' + SEM[+k.split('.')[1]] + ': 0 Punkte, gilt als nicht belegt'),
    );
    // Kunst oder Musik: 2 aufeinanderfolgende Kurse, ersatzweise 2 Literaturkurse
    const art = [];
    ['ku', 'mu'].forEach((id) =>
      [0, 1, 2].forEach(
        (i) => ok(id + '.' + i) && ok(id + '.' + (i + 1)) && art.push([id + '.' + i, id + '.' + (i + 1)]),
      ),
    );
    const li = aks('li').sort(byP);
    if (li.length >= 2) art.push(li.slice(0, 2));
    const artOk = art.some((o) => o.every((k) => must.has(k)));
    if (!art.length) viol.add('Kunst oder Musik: 2 aufeinanderfolgende Kurse (ersatzweise 2 Literaturkurse) nötig');
    if (ks('li').filter((k) => must.has(k)).length > RULE.li)
      viol.add('Literatur: höchstens ' + RULE.li + ' Kurse sind anrechenbar');
    return { must, viol: [...viol], art: artOk ? [[]] : art.length ? art : [[]] };
  };

  // --- Beste Auswahl zu einer Pflichtmenge ---------------------------------
  const Bs = C.filter((c) => c.t == 'B' && c.p > 0),
    mult = (c) => (c.t == 'B' ? SPW[c.sp] : 1),
    lim = (cnt) => (nu ? RULE27.def : cnt <= RULE.split ? RULE.defLo : RULE.defHi),
    limLK = nu ? RULE27.defLK : RULE.defLK,
    // zulässige Zahl eingebrachter Kurse: bis 2029 35 bis 40, ab 2030 genau 36
    cntIn = (cnt) => (nu ? cnt == RULE27.n : cnt >= RULE.min && cnt <= RULE.max),
    better = (P, N, cnt, o) => !o || P * o.N > o.P * N || (P * o.N == o.P * N && cnt > o.cnt);
  const evalSet = (F) => {
    const forced = [...F].map((k) => I[k]),
      pool = C.filter((c) => c.p > 0 && c.t != 'B' && !F.has(c.k)).sort((x, y) => y.p - x.p);
    let nli = forced.filter((c) => c.id == 'li').length;
    const ord = pool.filter((c) => c.id != 'li' || nli++ < RULE.li); // Literatur-Obergrenze
    let best = null,
      any = null,
      anyIn = null; // beste Auswahl mit zulässiger Kurszahl, Defizite ungeprüft
    const upd = (P, N, cnt, d, ld, k, mask) => {
      if (!N) return;
      const r = { P, N, cnt, d, ld, k, mask };
      if (better(P, N, cnt, any)) any = r;
      if (cntIn(cnt) && better(P, N, cnt, anyIn)) anyIn = r;
      if (cntIn(cnt) && d <= lim(cnt) && ld <= limLK && better(P, N, cnt, best)) best = r;
    };
    for (let mask = 0; mask < 1 << Bs.length; mask++) {
      let P = 0,
        N = 0,
        cnt = 0,
        d = 0,
        ld = 0;
      const add = (c) => {
        const m = mult(c),
          l = c.t == 'LK' ? 2 : 1;
        P += c.p * m * l;
        N += m * l;
        cnt += m;
        if (c.p <= 4) {
          d += m;
          if (c.t == 'LK') ld += m;
        }
      };
      forced.forEach(add);
      Bs.forEach((c, j) => (mask >> j) & 1 && add(c));
      upd(P, N, cnt, d, ld, 0, mask);
      ord.forEach((c, k) => {
        add(c);
        upd(P, N, cnt, d, ld, k + 1, mask);
      });
    }
    return { best, any: anyIn || any, ord };
  };

  // --- Alle Zuordnungen durchprobieren, die beste gewinnt -------------------
  // Rangfolge: wenigste verletzte Pflichtbedingungen, dann zulässige Auswahl (Kurszahl, Defizite), dann bester Schnitt.
  let win = null;
  for (const fs of fsC)
    for (const nw of nwC)
      for (const gw of gwC)
        for (const sf of sfC(fs, nw)) {
          const a = { fs, nw, gw, sf },
            b = build(a);
          for (const o of b.art) {
            const F = new Set([...b.must, ...o]),
              e = evalSet(F),
              r = e.best || e.any;
            if (!r) continue;
            const w = { F, a, viol: b.viol, e, r, feas: !!e.best };
            if (
              !win ||
              (w.viol.length != win.viol.length
                ? w.viol.length < win.viol.length
                : w.feas != win.feas
                  ? w.feas
                  : better(r.P, r.N, r.cnt, win.r))
            )
              win = w;
          }
        }
  if (!win) return null;
  const r = win.r,
    set = [...win.F]
      .map((k) => I[k])
      .concat(
        Bs.filter((c, j) => (r.mask >> j) & 1),
        win.e.ord.slice(0, r.k),
      ),
    ntot = C.reduce((s, c) => s + (c.p > 0 ? mult(c) : 0), 0),
    // belegte Kurse: bis 2029 zählen nur anrechenbare (mind. 38), ab 2030 genau 40 inklusive Vertiefungskurse
    nbel = nu ? ntot + (+st.vk || 0) : ntot,
    belegtOk = nu ? nbel >= RULE27.belegt : ntot >= RULE.belegt;
  return {
    nu,
    set,
    keys: new Set(set.map((c) => c.k)),
    P: r.P,
    N: r.N,
    cnt: r.cnt,
    d: r.d,
    ld: r.ld,
    must: win.F, // Pflichtkurse (ohne freiwillige Kurse)
    asg: win.a, // zugeordnete Pflichtfächer
    viol: win.viol, // nicht erfüllte Pflichtbedingungen
    feas: win.feas, // Kurszahl und Defizite zulässig
    cntOk: cntIn(r.cnt),
    defOk: r.d <= lim(r.cnt) && r.ld <= limLK,
    defMax: lim(r.cnt),
    belegtOk,
    ok: win.feas && !win.viol.length && belegtOk,
    ntot, // anrechenbare Kurse (mindestens 1 Punkt; Projektkurs usw. mit ihrem Gewicht)
    nbel, // belegte Kurse (ab 2030 mit Vertiefungskursen)
    a5, // 5. Abiturfach (ab 2030)
    ref5, // 5. Abiturfach ist das Referenzfach des Projektkurses
    items: C, // alle Kurse inkl. angesetzter
    C: C.filter((c) => !c.est), // nur Kurse mit eigener Note (für Schnitte)
    est: C.filter((c) => c.est).length,
    avg: r.P / r.N,
    b1: Math.min(600, R((r.P / r.N) * 40)),
  };
}
// Block II bis zum Abitur 2029 (§ 29 Abs. 2 und 4 alt): vier Prüfungen, jedes Ergebnis fünffach.
// Ab dem Abitur 2030 (§ 38 Abs. 3 APO-GOSt (2027)): fünf Prüfungen, jedes Ergebnis vierfach; das 5. Fach ist eine
// Präsentationsprüfung (§ 35) oder eine Besondere Lernleistung mit Kolloquium (§ 36).
// Bei schriftlicher und mündlicher Prüfung im 1. bis 3. Fach zählt schriftlich doppelt; gerundet wird erst der
// gewichtete Wert (Tabelle in Anlage 8 VVzAPO-GOSt: bisher (2s + m) ÷ 3 × 5, ab 2030 (2s + m) ÷ 3 × 4, ab ,5 auf;
// z. B. schriftlich 5 und mündlich 6: bisher 16 ÷ 3 × 5 = 26,7, also 27; ab 2030 16 ÷ 3 × 4 = 21,3, also 21).
// e = Ergebnis in einfacher Wertung (ggf. mit Nachkommastellen), eb = Punkte in Block II.
const exW = () => (isNeu(st) ? RULE27.w : 5), // Gewicht einer Prüfung in Block II
  exN = () => (isNeu(st) ? RULE27.ex : 4); // Zahl der Prüfungen
function exams() {
  const out = [],
    w = exW();
  for (let n = 1; n <= exN(); n++) {
    const x = st.x[n] || {},
      id = (S.find(([i]) => st.af[i] == n) || [])[0],
      s = num(x.s),
      m = num(x.m);
    let e = null,
      eb = null;
    if (s != null) {
      if (n < 4 && m != null) {
        e = (2 * s + m) / 3;
        eb = R(((2 * s + m) * w) / 3);
      } else {
        e = s;
        eb = w * s;
      }
    }
    out.push({ n, id, e, eb, lk: !!id && (st.cells[id] || []).includes('LK') });
  }
  return out;
}
// Prognose für eine noch fehlende Prüfung: Schnitt der benoteten Kurse im Prüfungsfach, sonst Block-I-Schnitt.
// Ist das 5. Abiturfach das Referenzfach des Projektkurses, gehören die Projektkurs-Halbjahre dazu (die Präsentation
// beruht auf den Produkten des Projektkurses).
function guess(r, id, n) {
  const pk = n == 5 && r.ref5,
    a = id ? r.C.filter((c) => (c.id == id || (pk && c.id == 'pk')) && c.t != 'B') : [];
  return a.length ? R(a.reduce((s, c) => s + c.p, 0) / a.length) : R(r.avg);
}
function tot(r) {
  const ex = exams(),
    w = exW(),
    v = ex.map((e) => e.eb ?? w * guess(r, e.id, e.n)),
    done = ex.every((e) => e.eb != null),
    b2 = Math.min(300, v.reduce((a, x) => a + x, 0)),
    G = r.b1 + b2;
  // Mindestbedingung: bisher in 2 Prüfungsfächern je 25 (= 5 × 5), ab 2030 in 3 Prüfungsfächern je 20 (= 4 × 5),
  // jeweils darunter ein Leistungskursfach
  const lo = isNeu(st) ? RULE27.min : 25,
    nn = isNeu(st) ? RULE27.need : 2,
    fin = done && courses().every((c) => pts(c).fin),
    nx = v.filter((x) => x >= lo).length >= nn && ex.some((e, i) => e.lk && v[i] >= lo);
  return {
    ex,
    v,
    done,
    b2,
    G,
    fin,
    nx,
    lo,
    nn,
    pass: G >= 300 && r.b1 >= 200 && b2 >= 100 && nx && r.ok,
  };
}
const grade = (G) =>
  G < 300
    ? 'nicht bestanden'
    : f1(Math.max(10, Math.floor((1020 - G) / 18)) / 10);
const gn = (p) => (p == null ? '–' : f1(Math.max(1, (17 - p) / 3))),
  av = (p) => (p == null ? '–' : gn(p) + ' (' + f1(p) + ' P)');
const wm = (a) => {
  let p = 0,
    n = 0;
  a.forEach((c) => {
    const l = c.t == 'LK' ? 2 : 1;
    p += c.p * l;
    n += l;
  });
  return n ? p / n : null;
};
