// Prüft, ob die App-Version überall gleich ist (sonst lädt die Home-Bildschirm-App ständig neu oder nie):
//   node tests/version.test.js        Version setzen: node tools/bump-version.mjs
const fs = require('fs'),
  path = require('path'),
  assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'),
  meta = (/<meta name="app-version" content="([^"]*)"/.exec(html) || [])[1],
  json = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8')).v;
assert.ok(meta, 'index.html: <meta name="app-version"> fehlt oder ist leer');
assert.strictEqual(json, meta, 'version.json und index.html haben verschiedene Versionen');
const own = [...html.matchAll(/(?:src|href)="(?![a-z]+:)([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)].map((m) => m[1]);
assert.ok(own.length >= 15, 'zu wenige eigene Dateien gefunden');
for (const f of own) assert.ok(f.endsWith('?v=' + meta), f + ' hat nicht ?v=' + meta);
assert.ok(/connect-src 'self'/.test(html), "CSP: connect-src braucht 'self' für version.json");
console.log('version: ' + meta + ', ' + own.length + ' Dateien mit passender Version');
