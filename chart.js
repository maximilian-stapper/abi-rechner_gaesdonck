/* Verlauf der Hochrechnung: speichert die Punktzahl bei jeder Änderung und zeichnet sie als Linie.
   Nach oben = besser (Abinote sinkt) = grün, nach unten = schlechter = rot. */
const HIST_MAX = 40; // so viele Messpunkte werden höchstens gespeichert

// Messpunkt speichern, wenn sich die Hochrechnung seit dem letzten Punkt geändert hat
function record(G) {
  const h = (st.h = Array.isArray(st.h) ? st.h : []);
  if (h.length && h[h.length - 1][1] === G) return false;
  h.push([Date.now(), G]);
  if (h.length > HIST_MAX) h.splice(0, h.length - HIST_MAX);
  return true;
}

// Punkte -> Abinote als Zahl (ohne Abrunden, damit die Linie auch kleine Änderungen zeigt)
const noteExact = (G) => Math.max(1, (1020 - G) / 180);

function trend() {
  const h = (Array.isArray(st.h) ? st.h : [])
    .filter((p) => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]))
    .slice(-HIST_MAX);
  if (h.length < 2) {
    return '<div class="trend flat"><p class="trend__hint">Hier erscheint dein Verlauf, sobald sich die Hochrechnung ändert.</p></div>';
  }
  const W = 300,
    H = 84,
    PX = 10,
    PY = 12,
    n = h.length,
    v = h.map((p) => noteExact(p[1])),
    lo = Math.min(...v),
    hi = Math.max(...v),
    span = Math.max(hi - lo, 0.3), // kleine Schwankungen nicht übertreiben
    mid = (hi + lo) / 2,
    x = (i) => PX + (i * (W - 2 * PX)) / (n - 1),
    y = (val) => H / 2 + ((val - mid) / span) * (H - 2 * PY), // bessere Note = weiter oben
    pts = v.map((val, i) => [x(i), y(val)]);
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < n; i++) {
    const [x0, y0] = pts[i - 1],
      [x1, y1] = pts[i],
      m = (x1 - x0) / 2;
    d += ` C${(x0 + m).toFixed(1)} ${y0.toFixed(1)} ${(x1 - m).toFixed(1)} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  const last = pts[n - 1],
    area = `${d} L${last[0].toFixed(1)} ${H} L${pts[0][0].toFixed(1)} ${H} Z`,
    dG = h[n - 1][1] - h[0][1],
    cls = dG > 0 ? 'up' : dG < 0 ? 'down' : 'flat',
    dn = Math.round(Math.abs(v[n - 1] - v[0]) * 10) / 10,
    label =
      dG == 0
        ? 'unverändert'
        : (dG > 0 ? '▲ ' : '▼ ') +
          (dn
            ? f1(dn) + (dG > 0 ? ' besser' : ' schlechter')
            : Math.abs(dG) + (dG > 0 ? ' Punkte mehr' : ' Punkte weniger')),
    since = new Date(h[0][0]).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
    });
  return `<div class="trend ${cls}">
    <div class="trend__head"><span>Verlauf</span><b>${label}</b></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Verlauf der Hochrechnung: ${label}">
      <defs><linearGradient id="trendfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".28"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
      <path class="trend__area" d="${area}" fill="url(#trendfill)"/>
      <path class="trend__line" d="${d}" pathLength="1"/>
      <circle class="trend__halo" cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="7"/>
      <circle class="trend__dot" cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.5"/>
    </svg>
    <div class="trend__foot"><span>seit ${since}</span><span>jetzt</span></div>
  </div>`;
}
