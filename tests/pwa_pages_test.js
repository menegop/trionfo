'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name),'utf8');
const exists = name => fs.existsSync(path.join(root, name));
const manifest = JSON.parse(read('manifest.webmanifest'));
assert.equal(manifest.start_url, './index.html');
assert.equal(manifest.scope, './');
assert.equal(manifest.display, 'standalone');
assert(manifest.icons.some(i=>i.sizes==='192x192'));
assert(manifest.icons.some(i=>i.sizes==='512x512' && i.purpose==='maskable'));
for (const icon of manifest.icons) {
  assert(exists(icon.src), icon.src);
  const bytes = fs.readFileSync(path.join(root,icon.src));
  assert.equal(bytes.subarray(1,4).toString(),'PNG');
  const size = Number(icon.sizes.split('x')[0]);
  assert.equal(bytes.readUInt32BE(16),size);
  assert.equal(bytes.readUInt32BE(20),size);
}
const html=read('index.html');
for(const s of ['rel="manifest"','id="installAppBtn"','id="offlineSaveBtn"','src="pwa.js"','src="vendor/ort.wasm.min.js"']) assert(html.includes(s),s);
for(const s of ['serviceWorker.register(\'./sw.js\'','beforeinstallprompt','OFFLINE_PREPARE','OFFLINE_STATUS']) assert(read('pwa.js').includes(s),s);
const sw=read('sw.js');
for (const s of ["const BASE_URL = self.registration.scope", "'./models/trionfo_v14.onnx'", "'./vendor/ort.wasm.min.js'", "'./vendor/ort-wasm-simd-threaded.mjs'", "'./vendor/ort-wasm-simd-threaded.wasm'", "'./index.html'", "'./assets/cards/'"]) assert(sw.includes(s),s);
for(const p of ['.nojekyll','PREPARA_GITHUB_PAGES.ps1','PREPARA_GITHUB_PAGES.bat','ESPORTA_V14_PER_PAGES.bat']) assert(exists(p),p);
assert(read('PREPARA_GITHUB_PAGES.ps1').includes('onnxruntime-web@$version/dist'));
assert(read('README_PUBBLICAZIONE.md').includes('/ (root)'));
assert.equal(new URL('./vendor/ort.wasm.min.js','https://user.github.io/trionfo-ferrarese/').href,
 'https://user.github.io/trionfo-ferrarese/vendor/ort.wasm.min.js');
console.log('OK: manifest installabile, icone Android 192/512, percorso GitHub Pages, bundle OFFLINE e script locale.');
