function courses() {
  const a = [];
  for (const [id] of S)
    (st.cells[id] || []).forEach((t, i) => {
      if (t) a.push({ k: id + '.' + i, id, i, t });
    });
  // Projektkurs, Advanced Class, Facharbeit: je eine Note (Ende Q1.2), zählt doppelt
  for (const type of Object.keys(SP))
    if (st.sp[type])
      a.push({ k: 'sp_' + type, id: 'sp_' + type, sp: type, i: -1, t: 'B' });
  return a;
}
const nm = (c) =>
  c.t == 'B'
    ? SP[c.sp] + (st.sp[c.sp].name ? ': ' + st.sp[c.sp].name : '')
    : NM[c.id];
function pts(c) {
  const g = st.g[c.k] || {};
  if (g.f !== undefined && g.f !== null && g.f !== '')
    return { p: +g.f, fin: 1 };
  const m = (g.m || []).filter((r) => num(r.n) != null),
    s = (g.s || []).filter((v) => num(v) != null);
  const o = m.length
      ? m.reduce((a, r) => a + r.n * (r.w || 1), 0) /
        m.reduce((a, r) => a + (r.w || 1), 0)
      : null,
    w = s.length ? s.reduce((a, v) => a + +v, 0) / s.length : null;
  const p =
    o == null ? w : w == null ? o : c.t == 'S' || c.t == 'LK' ? (o + w) / 2 : o;
  return { p: p == null ? null : R(p), fin: 0 };
}
function groups() {
  const ce = (id) => st.cells[id] || [],
    n = (id) => ce(id).filter((x) => x).length,
    ks = (id) => [0, 1, 2, 3].filter((i) => ce(id)[i]).map((i) => id + '.' + i);
  const top = (id) => ce(id).includes('LK') || st.af[id] > 0,
    must = new Set(),
    alt = [],
    done = new Set(),
    add = (id) => {
      ks(id).forEach((k) => must.add(k));
      done.add(id);
    };
  const pick = (l) =>
    l.find((id) => top(id) && n(id) == 4) || l.find((id) => n(id) == 4);
  S.forEach(([id]) => {
    if (top(id)) add(id);
  });
  ['de', 'ma'].forEach(add);
  [pick(FS), pick(NW), pick(GW)].forEach((id) => id && add(id));
  GW.forEach((id) => {
    if (!done.has(id)) add(id);
  });
  S.forEach(([id]) =>
    ce(id).forEach((t, i) => {
      if (t == 'ZK') must.add(id + '.' + i);
    }),
  );
  const pairs = (a) =>
    a.length < 2 ? [a] : a.flatMap((x, i) => a.slice(i + 1).map((y) => [x, y]));
  if (!done.has('re') && n('re')) alt.push(pairs(ks('re')));
  const km = [];
  ['ku', 'mu'].forEach((id) => {
    if (!done.has(id))
      for (let i = 0; i < 3; i++)
        if (ce(id)[i] && ce(id)[i + 1])
          km.push([id + '.' + i, id + '.' + (i + 1)]);
  });
  if (km.length) alt.push(km);
  const c9 = [...FS, 'bi', 'ch', 'ph', 'if']
    .filter((id) => !done.has(id) && ce(id)[2] && ce(id)[3])
    .map((id) => [id + '.2', id + '.3']);
  if (c9.length) alt.push(c9);
  return { must, alt };
}
function solve() {
  const C = courses()
      .map((c) => ({ ...c, ...pts(c) }))
      .filter((c) => c.p != null),
    I = {};
  C.forEach((c) => (I[c.k] = c));
  const Bs = C.filter((c) => c.t == 'B');
  if (!C.length) return null;
  const { must, alt } = groups(),
    ntot = C.reduce((a, c) => a + (c.t == 'B' ? 2 : 1), 0),
    cons = ntot >= 35;
  let best = null,
    any = null;
  const better = (a, b) =>
    !b || a.P * b.N > b.P * a.N || (a.P * b.N == b.P * a.N && a.cnt > b.cnt);
  const ev = (ch) => {
    const F = new Set([...must, ...ch].filter((k) => I[k] && I[k].t != 'B')),
      pool = C.filter((c) => !F.has(c.k) && c.t != 'B').sort(
        (a, b) => b.p - a.p,
      );
    for (let mask = 0; mask < 1 << Bs.length; mask++)
      for (let k = 0; k <= pool.length; k++) {
        const set = [...F].map((x) => I[x]).concat(pool.slice(0, k));
        Bs.forEach((c, j) => {
          if ((mask >> j) & 1) set.push(c);
        });
        let P = 0,
          N = 0,
          cnt = 0,
          d = 0,
          ld = 0;
        for (const c of set) {
          const m = c.t == 'B' ? 2 : 1,
            l = c.t == 'LK' ? 2 : 1;
          P += c.p * m * l;
          N += m * l;
          cnt += m;
          if (c.p <= 4) {
            d += m;
            if (c.t == 'LK') ld += m;
          }
        }
        if (!N) continue;
        const r = { set, P, N, cnt, d, ld };
        if (better(r, any)) any = r;
        if (
          !cons ||
          (cnt >= 35 && cnt <= 40 && d <= (cnt <= 37 ? 7 : 8) && ld <= 3)
        ) {
          if (better(r, best)) best = r;
        }
      }
  };
  const rec = (i, ch) => {
    if (i == alt.length) return ev(ch);
    for (const o of alt[i]) rec(i + 1, ch.concat(o));
  };
  rec(0, []);
  const r = best || any;
  if (!r) return null;
  r.ok = !!best;
  r.keys = new Set(r.set.map((c) => c.k));
  r.must = must;
  r.avg = r.P / r.N;
  r.b1 = Math.min(600, R(r.avg * 40));
  r.ntot = ntot;
  r.C = C;
  return r;
}
function exams() {
  const out = [];
  for (let n = 1; n <= 4; n++) {
    const x = st.x[n] || {},
      id = (S.find(([i]) => st.af[i] == n) || [])[0],
      s = num(x.s),
      m = num(x.m);
    let e = null;
    if (n == 4) e = s;
    else if (s != null) e = m != null ? R((2 * s + m) / 3) : s;
    out.push({ n, id, e, lk: !!id && (st.cells[id] || []).includes('LK') });
  }
  return out;
}
function tot(r) {
  const ex = exams(),
    sub = R(r.avg),
    v = ex.map((e) => e.e ?? sub),
    done = ex.every((e) => e.e != null),
    b2 = Math.min(300, v.reduce((a, x) => a + x, 0) * 5),
    G = r.b1 + b2;
  const fin = done && courses().every((c) => pts(c).fin),
    n5 =
      v.filter((x) => x >= 5).length >= 2 &&
      ex.some((e, i) => e.lk && v[i] >= 5);
  return {
    ex,
    v,
    done,
    b2,
    G,
    fin,
    n5,
    pass: G >= 300 && r.b1 >= 200 && b2 >= 100 && n5 && r.ok,
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
