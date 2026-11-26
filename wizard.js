// Auswahl eines Pflichtfachs (Einrichtung, Schritt 3). Leer = der Rechner wählt automatisch die günstigste zulässige Möglichkeit.
function pfSel(key, label, list) {
  const ok = list.filter((id) => (W.cells[id] || []).filter((x) => x).length == 4);
  return `<h4>${label}</h4><select data-pf="${key}"><option value="">automatisch (günstigste Wahl)</option>${ok
    .map((id) => `<option value="${id}" ${(W.pf || {})[key] == id ? 'selected' : ''}>${NM[id]}</option>`)
    .join('')}</select>`;
}
const chkBox = (id, on, text) =>
  `<label class=ir style="margin-top:10px;align-items:flex-start"><input type=checkbox id=${id} ${on ? 'checked' : ''} style="width:auto;margin-top:3px"><span class=d>${text}</span></label>`;

// Schritt 1: Abiturjahrgang. Er entscheidet, nach welcher APO-GOSt gerechnet wird (isNeu in constants.js).
function wizYear() {
  const y = +W.y || 0,
    nu = isNeu(W),
    yrs = !y || JAHRE.includes(y) ? JAHRE : [...JAHRE, y].sort((a, b) => a - b),
    // Ohne neue Regeln reicht es, nur den Jahrgang zu speichern (Fächer und Noten bleiben, wie sie sind)
    quick = st && y && isNeu(st) == nu;
  return `<div class=top><h1>Einrichtung 1/3</h1></div><div class=g><h2>In welchem Jahr machst du Abitur?</h2><p class=d>Davon hängt ab, wie gerechnet wird: Ab dem Abitur ${NEU_AB} gilt in NRW eine neue Prüfungsordnung (APO-GOSt 2027) mit fünf Abiturfächern, einem Projektkurs in der Q2 und anderen Regeln für Block I und II.</p>
 <select id=yr aria-label=Abiturjahr><option value="">– Abiturjahr wählen –</option>${yrs.map((j) => `<option value=${j} ${j == y ? 'selected' : ''}>Abitur ${j}</option>`).join('')}</select>${
   y >= NEU_AB && y <= NEU_AB + 1
     ? chkBox('q1alt', W.q1alt, 'Ich war schon im Schuljahr 2027/28 (oder früher) in der Q1 und wiederhole ein Jahr. Dann gilt für mich noch die bisherige APO-GOSt.')
     : ''
 }${
   y
     ? `<p class=d style="margin-top:10px;color:var(--ok)">✓ ${
         nu
           ? 'Für dich gilt die neue APO-GOSt (2027): fünf Abiturfächer, Projektkurs oder Advanced Class in Q2.1 und Q2.2, genau 36 Kurse in Block I, jede Prüfung zählt vierfach.'
           : 'Für dich gilt die bisherige APO-GOSt: vier Abiturfächer, 35 bis 40 Kurse in Block I, jede Prüfung zählt fünffach.'
       }</p>${nu ? `<p class=d style="margin-top:8px">${BETA} Die Rechnung nach der neuen Ordnung ist noch Beta: nach dem veröffentlichten Text umgesetzt und geprüft, aber noch ohne Erfahrung aus echten Jahrgängen.</p>` : ''}`
     : ''
 }</div>${st ? '' : '<div class=g><h2>Schon eine Sicherungsdatei?</h2><p class=d>Lade sie hier, dann entfällt die Einrichtung.</p><button class=bt data-a=im>Sicherungsdatei laden</button></div>'}
 <div id=msg class=d style="padding:0 6px;color:var(--w)"></div><div class=bar style="padding:0 4px">${st ? '<button class=bt data-a=back>Abbrechen</button>' : ''}${quick ? '<button class=bt data-a=ysv>Nur Jahrgang speichern</button>' : ''}<button class="bt pr" data-a=next>Weiter</button></div>`;
}

// Schritt 2: Fächer und Kursarten. Ab dem Abitur 2030 steht der Projektkurs (Q2) fest in der Tabelle.
function wizTable() {
  const nu = isNeu(W),
    row = (id, n, gr, fix) =>
      (gr ? `<tr class=grp><td colspan=5>${gr}</td></tr>` : '') +
      `<tr><td>${n}</td>${[0, 1, 2, 3]
        .map((i) => {
          const v = (W.cells[id] || [])[i] || '';
          return fix
            ? `<td><div class="cell fx" data-v="${v}" aria-label="${n} ${SEM[i]}: ${v || 'nicht belegt'}">${v || '–'}</div></td>`
            : `<td><div class=cell tabindex=0 role=button data-c="${id}.${i}" data-v="${v}">${v || '·'}</div></td>`;
        })
        .join('')}</tr>`;
  return `<div class=top><h1>Einrichtung 2/3</h1></div><div class=g><h2>Aus LuPO übernehmen</h2><p class=d>Lade deine LuPO-Datei (.lpo): Fächer, Kursarten und Abiturfächer werden automatisch ausgefüllt. Die Datei wird nur in deinem Browser gelesen und nirgendwohin hochgeladen. Übernommen werden nur die Fächer der Q-Phase, keine persönlichen Daten.</p>${impInfo ? `<p style="margin:6px 0;color:var(--ok)">✓ ${impInfo.n} Fächer übernommen. Abiturfächer: ${impInfo.af.map(esc).join(', ') || 'keine erkannt'}. Prüfe die Tabelle und tippe auf Weiter.</p>` : ''}<button class="bt pr" data-a=lp>LuPO-Datei laden</button></div><div class=g><h2>Welche Fächer hast du wann belegt?</h2><p class=d>Tippe ein Feld mehrfach: leer → S (Grundkurs mit Klausuren) → M (Grundkurs ohne Klausuren) → LK (Leistungskurs) → ZK (Zusatzkurs). Nur die Q-Phase zählt.${nu ? ' Einen Projektkurs oder eine Advanced Class in Q2.1 und Q2.2 belegen ab dem Abitur ' + NEU_AB + ' alle; das ist schon eingetragen (welches von beiden, wählst du im nächsten Schritt).' : ''}</p>
 <table><tr><th></th>${SEM.map((s) => `<th>${s}</th>`).join('')}</tr>${S.map(([id, n, gr]) => row(id, n, gr)).join('')}${nu ? row('pk', 'Projektkurs / AC', 'Projektkurs oder Advanced Class (Pflicht)', true) : ''}</table>${
   nu
     ? `<h4>Vertiefungskurse in der Q-Phase</h4><input id=vk type=number inputmode=numeric min=0 max=12 value="${W.vk || 0}" aria-label="Anzahl Vertiefungskurse"><small>Anzahl der Halbjahreskurse insgesamt. Sie bekommen keine Note, zählen aber zu den genau 40 Kursen, die du in der Q-Phase belegen musst.</small>`
     : ''
 }</div>
 <div class=bar style="padding:0 4px">${st ? '<button class=bt data-a=back>Abbrechen</button>' : ''}<button class=bt data-a=prev>Zurück</button><button class="bt pr" data-a=next>Weiter</button></div>`;
}

// Schritt 3: Abiturfächer, Pflichtfächer und (bis 2029) Projektkurs/Advanced Class bzw. (ab 2030) Projektkurs in der Q2.
function wizAbi() {
  const nu = isNeu(W),
    has = ([id]) => (W.cells[id] || []).some((x) => x),
    opt = (n) => ([id, nn]) => `<option value="${id}" ${W.af[id] == n ? 'selected' : ''}>${nn}</option>`,
    sel = (n) =>
      `<h4>Abiturfach ${n}${nu && n == 5 ? ' (Präsentationsprüfung oder Besondere Lernleistung)' : ''}</h4><select data-af="${n}"><option value="">– wählen –</option>${S.filter(has).map(opt(n)).join('')}${
        nu && n == 5 && S.some((s) => !has(s))
          ? `<optgroup label="Nicht belegt (nur mit Besonderer Lernleistung)">${S.filter((s) => !has(s)).map(opt(n)).join('')}</optgroup>`
          : ''
      }</select>`,
    // Referenzfach des Projektkurses: in der Q1 schriftlich belegt (S), ausnahmsweise ein Leistungskurs (§ 11 Abs. 9)
    refs = S.filter(([id]) => [0, 1].every((i) => ['S', 'LK'].includes((W.cells[id] || [])[i]))),
    pj = W.pj || {};
  return `<div class=top><h1>Einrichtung 3/3</h1></div><div class=g><h2>Abiturfächer</h2><p class=d>${
    nu
      ? 'Abiturfach 1 und 2 sind Leistungskurse, Fach 3 wird schriftlich und Fach 4 mündlich geprüft. Im 5. Fach legst du eine Präsentationsprüfung ab (im Referenzfach deines Projektkurses oder in einem weiteren schriftlichen Grundkurs) oder bringst eine Besondere Lernleistung ein.'
      : 'Abiturfach 1 und 2 sind Leistungskurse. Fach 4 wird nur mündlich geprüft.'
  }</p>${(nu ? [1, 2, 3, 4, 5] : [1, 2, 3, 4]).map(sel).join('')}${
    nu
      ? chkBox('bll', W.bll, 'Im 5. Fach bringe ich eine Besondere Lernleistung ein (Arbeit und Kolloquium statt Präsentationsprüfung). Dann muss dieses Fach nicht mit vier Kursen in Block I zählen.')
      : ''
  }</div>
 <div class=g><h2>Pflichtfächer (optional)</h2><p class=d>Der Rechner erkennt aus deiner Fächerwahl, welche Kurse in Block I Pflicht sind, und wählt bei mehreren Möglichkeiten automatisch die günstigste. Wenn du weißt, welches Fach in deiner Laufbahn gilt, lege es hier fest.</p>${pfSel('fs', 'Fortgeführte Fremdsprache', FS)}${pfSel('nw', 'Naturwissenschaft', NW)}${pfSel('gw', 'Gesellschaftswissenschaft', GW)}${pfSel('sf', 'Schwerpunktfach (9. Pflichtfach: weitere Fremdsprache oder MINT-Fach)', SF)}${(W.cells.es || []).some((x) => x) ? chkBox('nz2', W.nz2, 'Ich hatte in der Sekundarstufe I keine zweite Fremdsprache und habe Spanisch deshalb ab der EF neu begonnen. Dann muss Spanisch eingebracht werden (die Q2-Kurse, als einzige Fremdsprache alle vier).') : ''}</div>
 ${
   nu
     ? `<div class=g><h2>Projektkurs oder Advanced Class (Q2)</h2><p class=d>Einen Projektkurs oder an seiner Stelle eine Advanced Class belegst du in Q2.1 und Q2.2; beide Halbjahre zählen in Block I, beides wird gleich gerechnet. Der Kurs hängt an einem Referenzfach, das du in der Q1 schriftlich belegst. Ist das Referenzfach dein 5. Abiturfach, zählen davon nur die beiden Q1-Kurse, dazu die zwei Halbjahre in der Q2.</p><h4>Art</h4><select id=pjt>${Object.entries(SP)
         .map(([k, l]) => `<option value=${k} ${(pj.type || 'pk') == k ? 'selected' : ''}>${l}</option>`)
         .join('')}</select><h4>Referenzfach</h4><select id=pjr><option value="">– noch offen –</option>${refs
         .map(([id, n]) => `<option value="${id}" ${pj.ref == id ? 'selected' : ''}>${n}</option>`)
         .join('')}</select><h4>Name (optional)</h4><input id=pjn value="${esc(pj.name || '')}" placeholder="z. B. Nachhaltigkeit"></div>`
     : `<div class=g><h2>Besonderes</h2><p class=d>Projektkurs oder Advanced Class (in Q1): eine Note am Ende von Q1.2, sie zählt doppelt (auch für Q1.1). Das ist freiwillig: Der Rechner bringt sie nur ein, wenn sie deinen Schnitt verbessert. Eine Facharbeit gehört nicht hierher: Sie ersetzt eine Klausur in Q1.2, trag ihre Note dort als Klausur ein.</p>${impInfo ? (impInfo.pk ? '<p style="margin:6px 0;color:var(--ok)">✓ Projektkurs aus LuPO übernommen. Trag unten bitte seinen Namen ein.</p>' : '<p style="margin:6px 0;color:var(--w)">In deiner LuPO-Wahl steht kein Projektkurs. Belegst du eine Advanced Class, wähle sie bitte unten aus. Schreibst du eine Facharbeit, wähle „keins“.</p>') : ''}<select id=spt><option value="">keins</option>${Object.entries(SP)
         .map(([k, l]) => `<option value=${k} ${Object.keys(W.sp)[0] == k ? 'selected' : ''}>${l}</option>`)
         .join('')}</select><h4>Name (optional)</h4><input id=spn value="${esc((Object.values(W.sp)[0] || {}).name || '')}" placeholder="z. B. Sport-Ernährung-Gesundheit"></div>`
 }
 <div id=msg class=d style="padding:0 6px;color:var(--w)"></div><div class=bar style="padding:0 4px"><button class=bt data-a=prev>Zurück</button><button class="bt pr" data-a=fin>Speichern und starten</button></div>`;
}

function wiz() {
  if (!W) W = JSON.parse(JSON.stringify(st || fresh()));
  if (!W.pf) W.pf = {};
  if (!W.sp) W.sp = {};
  $('#app').dataset.view = 'wiz';
  $('#app').innerHTML = step == 0 ? wizYear() : step == 1 ? wizTable() : wizAbi();
  Motion.show('w:' + step);
}
function finish() {
  const nu = isNeu(W),
    na = nu ? 5 : 4,
    af = {},
    bad = [];
  document.querySelectorAll('[data-af]').forEach((s) => {
    if (s.value) {
      if (af[s.value]) bad.push('Ein Fach ist doppelt gewählt.');
      af[s.value] = +s.dataset.af;
    }
  });
  if (Object.keys(af).length < na || bad.length) {
    $('#msg').textContent = bad[0] || 'Bitte wähle alle ' + (nu ? 'fünf' : 'vier') + ' Abiturfächer.';
    return;
  }
  const bll = nu && !!($('#bll') && $('#bll').checked),
    ref = nu ? $('#pjr').value : '',
    a5 = Object.keys(af).find((id) => af[id] == 5);
  if (nu && !bll && !(W.cells[a5] || []).some((x) => x)) {
    $('#msg').textContent =
      NM[a5] + ' ist nicht belegt. Ohne Kurs geht das 5. Abiturfach nur mit einer Besonderen Lernleistung.';
    return;
  }
  const hint = [];
  for (const id in af) {
    const c = W.cells[id] || [],
      n = af[id],
      // 5. Fach = Referenzfach: schriftlich nur in der Q1 nötig; mit Besonderer Lernleistung gar nicht
      q1 = nu && n == 5 && id == ref;
    if (n < 3 && !c.includes('LK')) hint.push(NM[id] + ' sollte Leistungskurs sein.');
    if (n >= 3 && !(nu && n == 5 && bll) && !(q1 ? [0, 1] : [0, 1, 2]).every((i) => c[i] == 'S'))
      hint.push(NM[id] + ' braucht Klausuren (S) in ' + (q1 ? 'Q1.1 und Q1.2.' : 'Q1.1 bis Q2.1.'));
  }
  if (hint.length && !confirm(hint.join('\n') + '\nTrotzdem speichern?')) return;
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
  if (nu) {
    W.pj = { name: $('#pjn').value.trim(), ...(ref ? { ref } : {}), ...($('#pjt').value == 'ac' ? { type: 'ac' } : {}) };
    W.bll = bll;
  } else {
    const spType = $('#spt').value;
    W.sp = spType ? { [spType]: { name: $('#spn').value.trim() } } : {};
  }
  st = fit(W);
  W = null;
  step = 0;
  tab = 'ov';
  save();
  render();
}
