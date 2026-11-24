// Auswahl eines Pflichtfachs (Einrichtung, Schritt 2). Leer = der Rechner wählt automatisch die günstigste zulässige Möglichkeit.
function pfSel(key, label, list) {
  const ok = list.filter((id) => (W.cells[id] || []).filter((x) => x).length == 4);
  return `<h4>${label}</h4><select data-pf="${key}"><option value="">automatisch (günstigste Wahl)</option>${ok
    .map((id) => `<option value="${id}" ${(W.pf || {})[key] == id ? 'selected' : ''}>${NM[id]}</option>`)
    .join('')}</select>`;
}
function wiz() {
  if (!W) W = JSON.parse(JSON.stringify(st || fresh()));
  if (!W.pf) W.pf = {};
  $('#app').innerHTML =
    step == 1
      ? `<div class=top><h1>Einrichtung 1/2</h1></div><div class=g><h2>Aus LuPO übernehmen</h2><p class=d>Lade deine LuPO-Datei (.lpo): Fächer, Kursarten und Abiturfächer werden automatisch ausgefüllt. Die Datei wird nur in deinem Browser gelesen und nirgendwohin hochgeladen. Übernommen werden nur die Fächer der Q-Phase, keine persönlichen Daten.</p>${impInfo ? `<p style="margin:6px 0;color:var(--ok)">✓ ${impInfo.n} Fächer übernommen. Abiturfächer: ${impInfo.af.map(esc).join(', ') || 'keine erkannt'}. Prüfe die Tabelle und tippe auf Weiter.</p>` : ''}<button class="bt pr" data-a=lp>LuPO-Datei laden</button></div>${st ? '' : '<div class=g><h2>Schon eine Sicherungsdatei?</h2><p class=d>Lade sie hier, dann entfällt die Einrichtung.</p><button class=bt data-a=im>Sicherungsdatei laden</button></div>'}<div class=g><h2>Welche Fächer hast du wann belegt?</h2><p class=d>Tippe ein Feld mehrfach: leer → S (Grundkurs mit Klausuren) → M (Grundkurs ohne Klausuren) → LK (Leistungskurs) → ZK (Zusatzkurs). Nur die Q-Phase zählt.</p>
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
 <div class=g><h2>Pflichtfächer (optional)</h2><p class=d>Der Rechner erkennt aus deiner Fächerwahl, welche Kurse in Block I Pflicht sind, und wählt bei mehreren Möglichkeiten automatisch die günstigste. Wenn du weißt, welches Fach in deiner Laufbahn gilt, lege es hier fest.</p>${pfSel('fs', 'Fortgeführte Fremdsprache', FS)}${pfSel('nw', 'Naturwissenschaft', NW)}${pfSel('gw', 'Gesellschaftswissenschaft', GW)}${pfSel('sf', 'Schwerpunktfach (9. Pflichtfach: weitere Fremdsprache oder MINT-Fach)', SF)}${(W.cells.es || []).some((x) => x) ? `<label class=ir style="margin-top:10px;align-items:flex-start"><input type=checkbox id=nz2 ${W.nz2 ? 'checked' : ''} style="width:auto;margin-top:3px"><span class=d>Ich hatte in der Sekundarstufe I keine zweite Fremdsprache und habe Spanisch deshalb ab der EF neu begonnen. Dann muss Spanisch eingebracht werden (die Q2-Kurse, als einzige Fremdsprache alle vier).</span></label>` : ''}</div>
 <div class=g><h2>Besonderes</h2><p class=d>Projektkurs oder Advanced Class (in Q1): eine Note am Ende von Q1.2, sie zählt doppelt (auch für Q1.1). Das ist freiwillig: Der Rechner bringt sie nur ein, wenn sie deinen Schnitt verbessert. Eine Facharbeit gehört nicht hierher: Sie ersetzt eine Klausur in Q1.2, trag ihre Note dort als Klausur ein.</p>${impInfo ? (impInfo.pk ? '<p style="margin:6px 0;color:var(--ok)">✓ Projektkurs aus LuPO übernommen. Trag unten bitte seinen Namen ein.</p>' : '<p style="margin:6px 0;color:var(--w)">In deiner LuPO-Wahl steht kein Projektkurs. Belegst du eine Advanced Class, wähle sie bitte unten aus. Schreibst du eine Facharbeit, wähle „keins“.</p>') : ''}<select id=spt><option value="">keins</option>${Object.entries(
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
  Motion.show('w:' + step);
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
  const pf = {};
  document.querySelectorAll('[data-pf]').forEach((x) => {
    if (x.value) pf[x.dataset.pf] = x.value;
  });
  if (pf.sf && (pf.sf == pf.fs || pf.sf == pf.nw)) {
    $('#msg').textContent =
      'Das Schwerpunktfach muss ein anderes Fach sein als die Fremdsprache bzw. die Naturwissenschaft.';
    return;
  }
  W.pf = pf;
  W.af = af;
  W.nz2 = !!($('#nz2') && $('#nz2').checked && (W.cells.es || []).some((x) => x));
  impInfo = null;
  const spType = $('#spt').value;
  W.sp = spType ? { [spType]: { name: $('#spn').value.trim() } } : {};
  st = W;
  W = null;
  step = 1;
  tab = 'ov';
  save();
  render();
}
