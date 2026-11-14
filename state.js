let st = load(),
  W = null,
  tab = 'ov',
  step = 1;
const fresh = () => ({
  v: 1,
  cells: {},
  af: {},
  sp: { type: '', name: '' },
  g: {},
  x: {},
});
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(K));
    return s && s.cells ? s : null;
  } catch (e) {
    return null;
  }
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
