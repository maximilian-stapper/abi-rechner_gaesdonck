// LuPO-Import (Datei .lpo = Access-Datenbank). Alles läuft lokal im Browser:
// Die Datei wird per FileReader gelesen und nie hochgeladen. Gelesen wird nur die Tabelle
// ABP_SchuelerFaecher, und daraus nur Fach, Kursarten Q1.1–Q2.2, Abiturfach und die Stelle in der Sprachenfolge
// (nur für Spanisch ab EF: war es die zweite Fremdsprache, gilt § 28 Abs. 4/5).
// Namen, E-Mail, Geburtsdatum usw. (Tabelle ABP_Schueler) werden gar nicht geöffnet.

// LuPO-Fachkürzel → Fach-ID des Abi-Rechners.
// Nicht aufgeführt und bewusst ignoriert: PK (Projektkurs, siehe unten), VKE/VKM (Vertiefungskurse).
const LP = {
  D: 'de',
  E5: 'en',
  F7: 'fr',
  F8: 'fr',
  L7: 'la',
  S0: 'es',
  S9: 'e9',
  KU: 'ku',
  MU: 'mu',
  LI: 'li',
  EK: 'ek',
  GE: 'ge',
  SW: 'sw',
  KR: 're',
  SP: 'sp',
  M: 'ma',
  BI: 'bi',
  CH: 'ch',
  PH: 'ph',
  IF: 'if',
};
// LuPO-Kursart → Code des Rechners (S, M, LK, ZK; GKS/GKM zur Sicherheit)
const LPK = { S: 'S', M: 'M', LK: 'LK', ZK: 'ZK', GKS: 'S', GKM: 'M' };
const LPQ = ['Q1', 'Q2', 'Q3', 'Q4']; // = Q1.1, Q1.2, Q2.1, Q2.2 (EF.1/EF.2 = E1/E2 werden nicht gelesen)

let impInfo = null, // Hinweise für den Wizard nach einem Import (nicht gespeichert)
  lupoLib = null;

function lupoLoad() {
  return (lupoLib =
    lupoLib ||
    new Promise((ok, no) => {
      if (window.MDBOpen) return ok();
      const s = document.createElement('script');
      s.src = 'mdb-reader.js';
      s.onload = ok;
      s.onerror = () => {
        lupoLib = null;
        no(new Error('mdb-reader.js konnte nicht geladen werden'));
      };
      document.head.appendChild(s);
    }));
}

// ArrayBuffer der .lpo-Datei → { cells, af, pk, nz2 }
// nu = Abitur ab 2030: dann gibt es ein 5. Abiturfach, und Vertiefungskurse (VK…) werden gezählt, weil sie zu den
// 40 belegten Kursen gehören (§ 26 Abs. 1 APO-GOSt (2027)). Bis 2029 bleiben sie wie bisher unbeachtet.
function lupoParse(buf, nu) {
  const rd = window.MDBOpen(buf),
    tb = rd.getTable('ABP_SchuelerFaecher'),
    all = tb.getData({
      columns: [
        'Schueler_ID',
        'FachKrz',
        'AbiturFach',
        ...(tb.getColumnNames().includes('Sprachenfolge') ? ['Sprachenfolge'] : []),
        ...LPQ.map((q) => 'Kursart_' + q),
      ],
    }),
    sid = all.length ? all[0].Schueler_ID : null,
    rows = all.filter((r) => r.Schueler_ID === sid), // eine Datei = ein Schüler
    cells = {},
    af = {};
  let pk = false,
    vk = 0, // Vertiefungskurse in der Q-Phase (Halbjahre)
    nz2 = null; // Spanisch ab EF als zweite Fremdsprache (§ 28 Abs. 4/5)? null = Sprachenfolge unbekannt
  for (const r of rows) {
    const k = String(r.FachKrz || '').trim().toUpperCase(),
      sf = parseInt(r.Sprachenfolge, 10),
      q = LPQ.map((x) => LPK[String(r['Kursart_' + x] || '').trim().toUpperCase()] || '');
    if (k == 'S0' && sf > 0) nz2 = sf == 2;
    if (nu && /^VK/.test(k)) {
      vk += LPQ.filter((x) => String(r['Kursart_' + x] || '').trim()).length;
      continue;
    }
    if (k == 'PK') {
      if (q.some(Boolean)) pk = true;
      continue;
    }
    const id = LP[k];
    if (!id) continue;
    if (q.some(Boolean)) {
      const c = cells[id] || (cells[id] = ['', '', '', '']);
      q.forEach((v, i) => {
        if (v && !c[i]) c[i] = v;
      });
    }
    const a = +r.AbiturFach;
    if (a >= 1 && a <= (nu ? 5 : 4) && cells[id]) af[id] = a;
  }
  if (!Object.keys(cells).length) throw new Error('keine Q-Phase');
  return { cells, af, pk, vk, nz2: cells.es ? nz2 : false };
}

async function lupoImport(buf) {
  let res;
  // Der Entwurf W enthält schon den Abiturjahrgang aus Schritt 1; er entscheidet über die Regeln.
  const nu = isNeu(W || st);
  try {
    await lupoLoad();
    res = lupoParse(buf, nu);
  } catch (x) {
    alert(
      x && /geladen/.test(x.message)
        ? 'Das Lesemodul (mdb-reader.js) konnte nicht geladen werden. Bitte Seite neu laden.'
        : 'Diese Datei ist keine gültige LuPO-Datei oder enthält keine Q-Phase.',
    );
    return;
  }
  W = JSON.parse(JSON.stringify(W || st || fresh()));
  if (!W.sp) W.sp = {};
  W.cells = res.cells;
  W.af = res.af;
  if (res.nz2 !== null) W.nz2 = res.nz2;
  if (nu) W.vk = res.vk;
  // Projektkurs (bis Abitur 2029): nur "PK" steht in LuPO, der Name wird im Wizard abgefragt.
  // Ohne PK ist es eine Advanced Class (steht nicht in LuPO) – die wählt der Schüler selbst – oder eine Facharbeit,
  // die nur eine Klausur ersetzt. Ab 2030 ist der Projektkurs (Q2) ohnehin Pflicht und fest eingetragen.
  else if (res.pk) W.sp = { pk: { name: (W.sp.pk && W.sp.pk.name) || '' } };
  else if (W.sp.pk) W.sp = {};
  fit(W);
  impInfo = {
    pk: res.pk,
    n: Object.keys(res.cells).length,
    af: Object.keys(res.af)
      .sort((a, b) => res.af[a] - res.af[b])
      .map((id) => NM[id]),
  };
  step = 1;
  wiz();
  scrollTo(0, 0);
}
