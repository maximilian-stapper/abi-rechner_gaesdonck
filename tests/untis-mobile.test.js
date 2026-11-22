// Prüft den Einmalcode (TOTP) gegen die Testvektoren aus RFC 6238, den QR-Link, die Hausaufgaben-Auswertung
// und die Anfrage an den Worker (mit Attrappe statt Netzwerk):
//   node tests/untis-mobile.test.js
const fs = require('fs'),
  vm = require('vm'),
  path = require('path'),
  assert = require('assert');
const calls = [];
const ctx = { crypto: globalThis.crypto, URLSearchParams, encodeURIComponent, console, fetch: null };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'untis-mobile.js'), 'utf8') + ';this.M=UntisMobile', ctx);
const M = ctx.M,
  S = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // „12345678901234567890“ als Base32, wie im RFC
const res = (o, status = 200) => ({ ok: status < 400, status, json: async () => o });

(async () => {
  for (const [t, c] of [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037'], [20000000000, '353130']])
    assert.strictEqual(await M.totp(S, t * 1000), c, 'RFC 6238, t=' + t);
  assert.strictEqual(await M.totp('gezd gnbv-gy3t qojq gezd gnbv gy3t qojq', 59000), '287082'); // Leerzeichen, Bindestriche, Kleinbuchstaben
  await assert.rejects(M.totp('abc!', 1), (e) => e.code === 'KEY');
  console.log('ok  Einmalcode stimmt mit allen Testvektoren aus RFC 6238 überein');

  const q = M.parseQr('untis://setschool?url=gaesdonck.webuntis.com&school=gaesdonck&user=ab12&key=ABCDEF234567&schoolNumber=9');
  assert.deepStrictEqual({ ...q }, { server: 'gaesdonck.webuntis.com', school: 'gaesdonck', user: 'ab12', key: 'ABCDEF234567' });
  assert.strictEqual(M.parseQr('irgendwas'), null);
  console.log('ok  QR-Link wird zerlegt');

  // Anfrage: Adresse, Body, Anmeldeteil, kein Cookie, Schlüssel nie im Klartext
  const cfg = { proxy: 'https://w.example.workers.dev/', server: 'gaesdonck.webuntis.com', school: 'gaesdonck', user: 'ab12', key: S };
  ctx.fetch = async (url, init) => {
    calls.push({ url, init });
    const b = JSON.parse(init.body);
    if (b.method === 'getUserData2017') return res({ result: { userData: { elemId: 77, displayName: 'Max Muster' } } });
    if (b.method === 'getHomeWork2017')
      return res({ result: { homeWorks: [
        { id: 5, lessonId: 1, date: 20261120, dueDate: 20261124, text: 'S. 45 <b>Nr. 3</b>', completed: false },
        { id: 6, lessonId: 2, date: '2026-11-20', dueDate: '2026-11-25', text: 'Vokabeln', remark: 'bis Di', completed: true },
      ], lessons: [{ id: 1, subject: 'M L2' }, { id: 2, subject: 'L7 G2' }] } });
    return res({ error: { code: -32601, message: 'unknown' } });
  };
  const r = await M.homework(cfg, '2026-11-08', '2027-01-21');
  assert.strictEqual(calls.length, 2);
  assert.ok(calls[0].url.startsWith('https://w.example.workers.dev/gaesdonck.webuntis.com/WebUntis/jsonrpc_intern.do?m=getUserData2017&school=gaesdonck&v=i2.2'), calls[0].url);
  const b2 = JSON.parse(calls[1].init.body);
  assert.deepStrictEqual({ ...b2.params[0].auth, otp: 'x', clientTime: 0 }, { user: 'ab12', otp: 'x', clientTime: 0 });
  assert.match(b2.params[0].auth.otp, /^\d{6}$/);
  assert.strictEqual(b2.params[0].id, 77);
  assert.strictEqual(b2.params[0].type, 'STUDENT');
  assert.strictEqual(b2.params[0].startDate, '2026-11-08');
  assert.ok(!calls.some((c) => JSON.stringify(c).includes(S)), 'Der Schlüssel darf nie gesendet werden');
  assert.strictEqual(calls[0].init.credentials, 'omit');
  assert.strictEqual(r.homework.length, 2);
  assert.deepStrictEqual({ ...r.homework[0] }, { id: 'u5', date: '2026-11-20', due: '2026-11-24', text: 'S. 45 <b>Nr. 3</b>', remark: '', subName: 'M L2', teacher: '', done: false });
  assert.strictEqual(r.homework[1].due, '2026-11-25');
  assert.strictEqual(r.homework[1].done, true);
  assert.strictEqual(r.warn.length, 0);
  console.log('ok  Hausaufgaben: Anfrage, Anmeldeteil und Auswertung stimmen');

  // Fehlerfälle
  ctx.fetch = async () => res({ error: { code: -8504, message: 'bad credentials' } });
  await assert.rejects(M.test(cfg), (e) => e.code === 'AUTH' && /Uhrzeit/.test(e.message));
  ctx.fetch = async () => { throw new TypeError('x'); };
  await assert.rejects(M.test(cfg), (e) => e.code === 'NET');
  ctx.fetch = async () => res({}, 502);
  await assert.rejects(M.test(cfg), (e) => e.code === 'HTTP');
  await assert.rejects(M.test({ ...cfg, key: '' }), (e) => e.code === 'CONFIG');
  // Unerwartete Struktur: verständliche Warnung mit Feldnamen, keine Inhalte
  ctx.fetch = async (url, init) => res(JSON.parse(init.body).method === 'getUserData2017' ? { result: { userData: { elemId: 1 } } } : { result: { items: [{ a: 1, b: 2 }] } });
  const w = await M.homework(cfg, '2026-11-08', '2027-01-21');
  assert.strictEqual(w.homework.length, 0);
  assert.match(w.warn[0], /items\[1: a, b\]/);
  console.log('ok  Fehlerfälle liefern verständliche Meldungen');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
