let st = load(),
  W = null,
  tab = 'ov',
  step = 1;
const fresh = () => ({
  v: 1,
  cells: {},
  af: {},
  sp: {},
  g: {},
  x: {},
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
// Jetzt kann jede Art (Projektkurs, Advanced Class, Facharbeit) einzeln belegt sein: { pk: { name }, ... }
function migrate(s) {
  if (s.sp && typeof s.sp.type === 'string') {
    const old = s.sp;
    s.sp = old.type ? { [old.type]: { name: old.name || '' } } : {};
    if (s.g && s.g.sp !== undefined) {
      if (old.type) s.g['sp_' + old.type] = s.g.sp;
      delete s.g.sp;
    }
  } else if (!s.sp || typeof s.sp !== 'object') s.sp = {};
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
