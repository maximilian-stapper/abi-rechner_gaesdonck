let st = load(),
  W = null,
  tab = 'ov',
  step = 0; // Einrichtung: 0 = Abiturjahrgang, 1 = Fächer, 2 = Abiturfächer
const fresh = () => ({
  v: 1,
  cells: {},
  af: {},
  sp: {},
  g: {},
  x: {},
  pf: {},
});
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(K));
    return s && s.cells ? migrate(s) : null;
  } catch (e) {
    return null;
  }
}
// Ältere Stände hatten nur ein einzelnes „Besonderes" ({ type, name }).
// Jetzt kann jede Art (Projektkurs, Advanced Class) einzeln belegt sein: { pk: { name }, ... }
function migrate(s) {
  if (s.sp && typeof s.sp.type === 'string') {
    const old = s.sp;
    s.sp = old.type ? { [old.type]: { name: old.name || '' } } : {};
    if (s.g && s.g.sp !== undefined) {
      if (old.type) s.g['sp_' + old.type] = s.g.sp;
      delete s.g.sp;
    }
  } else if (!s.sp || typeof s.sp !== 'object') s.sp = {};
  // Die Facharbeit war früher eine eigene, doppelt zählende Note. Sie ersetzt aber nur eine Klausur in Q1.2.
  delete s.sp.fa;
  if (s.g) delete s.g.sp_fa;
  // Vom Schüler festgelegte Pflichtfächer { fs, nw, gw, sf }; leer = automatisch
  if (!s.pf || typeof s.pf !== 'object') s.pf = {};
  // Abiturjahrgang (st.y); fehlt er (Stände von vor 2026-11-25), rechnet der Rechner nach der bisherigen APO-GOSt
  if (s.y != null && !(Number.isInteger(+s.y) && +s.y > 2000)) delete s.y;
  fit(s);
  return s;
}
// Passt einen Stand an die Prüfungsordnung seines Jahrgangs an (beim Laden und am Ende der Einrichtung).
// Ab dem Abitur 2030: Projektkurs in der Q2 als Pflichtkurs (st.cells.pk = PKC), dazu st.pj = { name, ref, type }
// (type 'ac' = Advanced Class an seiner Stelle)
// (ref = Referenzfach), st.bll (Besondere Lernleistung im 5. Fach) und st.vk (Zahl der Vertiefungskurse in der Q-Phase,
// sie zählen nur zu den 40 belegten Kursen). Bis zum Abitur 2029 gibt es weder Projektkurs-Zeile noch 5. Abiturfach.
function fit(s) {
  if (!s.cells || typeof s.cells !== 'object') s.cells = {};
  if (!s.af || typeof s.af !== 'object') s.af = {};
  if (isNeu(s)) {
    s.cells.pk = PKC.slice();
    if (!s.pj || typeof s.pj !== 'object') s.pj = {};
    if (s.pj.ref && !(s.cells[s.pj.ref] || []).some(Boolean)) delete s.pj.ref;
    if (s.pj.type != 'ac') delete s.pj.type; // 'ac' = Advanced Class statt Projektkurs
    s.vk = Math.min(12, Math.max(0, Math.round(+s.vk) || 0));
    s.bll = !!s.bll;
  } else {
    delete s.cells.pk;
    for (const id in s.af) if (!(s.af[id] >= 1 && s.af[id] <= 4)) delete s.af[id];
  }
  return s;
}
function save() {
  try {
    localStorage.setItem(K, JSON.stringify(st));
  } catch (e) {
    alert(
      'Speichern im Browser nicht möglich (privater Modus?). Nutze die Sicherungsdatei im Menü.',
    );
  }
}
try {
  navigator.storage && navigator.storage.persist && navigator.storage.persist();
} catch (e) {}
