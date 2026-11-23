// Neue App-Version setzen, damit Browser und Home-Bildschirm-App die neuen Dateien laden:
//   node tools/bump-version.mjs
// Schreibt die Version (Datum und Uhrzeit) in index.html (<meta name="app-version"> und ?v=… an allen
// eigenen .js/.css-Dateien) und in version.json. Die App vergleicht beim Öffnen beides und lädt neu,
// wenn auf GitHub Pages eine neuere Version liegt. Vor jedem Commit mit Code-Änderungen ausführen.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'),
  two = (n) => String(n).padStart(2, '0'),
  d = new Date(),
  v = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}`,
  file = join(root, 'index.html');
let html = readFileSync(file, 'utf8');
html = html.replace(/(<meta name="app-version" content=")[^"]*(")/, `$1${v}$2`);
// eigene Dateien (ohne :// und ohne data:) mit ?v=… versehen bzw. die Version austauschen
html = html.replace(/((?:src|href)=")(?![a-z]+:)([^"?]+\.(?:js|css))(?:\?v=[^"]*)?(")/g, `$1$2?v=${v}$3`);
writeFileSync(file, html);
writeFileSync(join(root, 'version.json'), JSON.stringify({ v }) + '\n');
console.log('Version ' + v);
