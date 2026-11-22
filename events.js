document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-a],[data-e],[data-t],[data-c]');
  if (!t) return;
  const d = t.dataset,
    a = d.a;
  if (d.t !== undefined) {
    tab = d.t == 'ov' || d.t == 'ab' ? d.t : +d.t;
    render();
  } else if (d.e) edit(d.e);
  else if (d.c) {
    const [id, i] = d.c.split('.');
    const c = (W.cells[id] = W.cells[id] || ['', '', '', '']),
      v = CODES[(CODES.indexOf(c[i]) + 1) % 5];
    c[i] = v;
    t.dataset.v = v;
    t.textContent = v || '·';
  } else if (a == 'sc') actv(t);
  else if (a == 'pc') pick(d.p);
  else if (a == 'cx') $('#dlg').close();
  else if (a == 'sv') saveEdit(d.k);
  else if (a == 'menu') menu();
  else if (a == 'am') {
    $('#mr').insertAdjacentHTML('beforeend', mrow({ n: '' }));
    actv($('#mr').lastElementChild.querySelector('.sc'));
  } else if (a == 'as') {
    $('#sr').insertAdjacentHTML('beforeend', srow(''));
    actv($('#sr').lastElementChild.querySelector('.sc'));
  }
  else if (a == 'next') {
    step = 2;
    wiz();
    scrollTo(0, 0);
  } else if (a == 'prev') {
    step = 1;
    wiz();
    scrollTo(0, 0);
  } else if (a == 'back') {
    W = null;
    impInfo = null;
    step = 1;
    render();
  } else if (a == 'fin') finish();
  else if (a == 'wz') {
    $('#dlg').close();
    W = null;
    step = 1;
    wiz();
  } else if (a == 'ex') {
    const u = URL.createObjectURL(
        new Blob([JSON.stringify({ ...st, untis: Untis.backup() })], { type: 'application/json' }),
      ),
      l = document.createElement('a');
    l.href = u;
    l.download = 'abi-rechner-sicherung.json';
    l.click();
    setTimeout(() => URL.revokeObjectURL(u), 2000);
  } else if (a == 'im') $('#fi').click();
  else if (a == 'lp') $('#lf').click();
  else if (
    a == 'rs' &&
    confirm('Wirklich alle Fächer, Noten und Untis-Daten auf diesem Gerät löschen?')
  ) {
    try {
      localStorage.removeItem(K);
    } catch (x) {}
    Untis.reset();
    UntisUI.wipe();
    UntisUI.defaults();
    st = null;
    tab = 'ov';
    W = null;
    step = 1;
    $('#dlg').close();
    wiz();
  }
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.x) {
    const [n, f] = t.dataset.x.split('.');
    st.x[n] = st.x[n] || {};
    st.x[n][f] = cl(t.value);
    save();
    render();
  } else if (t.id == 'lf' && t.files[0]) {
    const fl = t.files[0],
      r = new FileReader();
    t.value = '';
    r.onload = () => lupoImport(r.result);
    r.onerror = () => alert('Die Datei konnte nicht gelesen werden.');
    r.readAsArrayBuffer(fl);
  } else if (t.id == 'fi' && t.files[0]) {
    const fl = t.files[0],
      r = new FileReader();
    t.value = '';
    r.onload = () => {
      try {
        const s = JSON.parse(r.result);
        if (!s.cells || !s.g) throw 0;
        const u = s.untis; // Untis-Daten gehören nicht in st; ältere Sicherungen haben sie nicht und lassen die vorhandenen unberührt
        delete s.untis;
        st = migrate(s);
        if (u) {
          Untis.restore(u);
          UntisUI.defaults(); // feste Adressen auffüllen, falls die Sicherung sie nicht enthält
        }
        W = null;
        step = 1;
        save();
        $('#dlg').close();
        tab = 'ov';
        render();
      } catch (x) {
        alert('Diese Datei ist keine gültige Sicherung.');
      }
    };
    r.readAsText(fl);
  }
});
document.addEventListener('keydown', (e) => {
  if ((e.key == 'Enter' || e.key == ' ') && e.target.matches('.cell,.row')) {
    e.preventDefault();
    e.target.click();
  }
});
