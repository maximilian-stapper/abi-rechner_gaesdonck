function wiz() {
  if (!W) W = JSON.parse(JSON.stringify(st || fresh()));
  $('#app').innerHTML =
    step == 1
      ? `<div class=top><h1>Einrichtung 1/2</h1></div>${st ? '' : '<div class=g><h2>Schon eine Sicherungsdatei?</h2><p class=d>Lade sie hier, dann entfällt die Einrichtung.</p><button class="bt pr" data-a=im>Sicherungsdatei laden</button></div>'}<div class=g><h2>Welche Fächer hast du wann belegt?</h2><p class=d>Tippe ein Feld mehrfach: leer → S (Grundkurs mit Klausuren) → M (Grundkurs ohne Klausuren) → LK (Leistungskurs) → ZK (Zusatzkurs). Nur die Q-Phase zählt.</p>
 <table><tr><th></th>${SEM.map((s) => `<th>${s}</th>`).join('')}</tr>${S.map(
   ([id, n, gr]) =>
     (gr ? `<tr class=grp><td colspan=5>${gr}</td></tr>` : '') +
     `<tr><td>${n}</td>${[0, 1, 2, 3]
       .map((i) => {
         const v = (W.cells[id] || [])[i] || '';
         return `<td><div class=cell tabindex=0 role=button data-c="${id}.${i}" data-v="${v}">${v || '·'}</div></td>`;
       })
       .join('')}</tr>`,
 ).join('')}</table></div>
 <div class=bar style="padding:0 4px">${st ? '<button class=bt data-a=back>Abbrechen</button>' : ''}<button class="bt pr" data-a=next>Weiter</button></div>`
      : `<div class=top><h1>Einrichtung 2/2</h1></div><div class=g><h2>Abiturfächer</h2><p class=d>Abiturfach 1 und 2 sind Leistungskurse. Fach 4 wird nur mündlich geprüft.</p>${[
          1, 2, 3, 4,
        ]
          .map(
            (n) =>
              `<h4>Abiturfach ${n}</h4><select data-af="${n}"><option value="">– wählen –</option>${S.filter(
                ([id]) => (W.cells[id] || []).some((x) => x),
              )
                .map(
                  ([id, nn]) =>
                    `<option value="${id}" ${W.af[id] == n ? 'selected' : ''}>${nn}</option>`,
                )
                .join('')}</select>`,
          )
          .join('')}</div>
 <div class=g><h2>Besonderes</h2><p class=d>Projektkurs, Advanced Class oder Facharbeit: nur eines davon. Eine Note am Ende von Q1.2, sie zählt doppelt (auch für Q1.1).</p><select id=spt><option value="">keins</option>${Object.entries(
   SP,
 )
   .map(
     ([k, l]) =>
       `<option value=${k} ${Object.keys(W.sp)[0] == k ? 'selected' : ''}>${l}</option>`,
   )
   .join(
     '',
   )}</select><h4>Name (optional)</h4><input id=spn value="${esc((Object.values(W.sp)[0] || {}).name || '')}" placeholder="z. B. Sport-Ernährung-Gesundheit"></div>
 <div id=msg class=d style="padding:0 6px;color:var(--w)"></div><div class=bar style="padding:0 4px"><button class=bt data-a=prev>Zurück</button><button class="bt pr" data-a=fin>Speichern und starten</button></div>`;
}
function finish() {
  const af = {},
    bad = [];
  document.querySelectorAll('[data-af]').forEach((s) => {
    if (s.value) {
      if (af[s.value]) bad.push('Ein Fach ist doppelt gewählt.');
      af[s.value] = +s.dataset.af;
    }
  });
  if (Object.keys(af).length < 4 || bad.length) {
    $('#msg').textContent = bad[0] || 'Bitte wähle alle vier Abiturfächer.';
    return;
  }
  const hint = [];
  for (const id in af) {
    const c = W.cells[id] || [];
    if (af[id] < 3 && !c.includes('LK'))
      hint.push(NM[id] + ' sollte Leistungskurs sein.');
    if (af[id] >= 3 && !(c[0] == 'S' && c[1] == 'S' && c[2] == 'S'))
      hint.push(NM[id] + ' braucht Klausuren (S) in Q1.1 bis Q2.1.');
  }
  if (hint.length && !confirm(hint.join('\n') + '\nTrotzdem speichern?'))
    return;
  W.af = af;
  const spType = $('#spt').value;
  W.sp = spType ? { [spType]: { name: $('#spn').value.trim() } } : {};
  st = W;
  W = null;
  step = 1;
  tab = 'ov';
  save();
  render();
}
