'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {TutorEngine} = require('../onnx_tutor.js');

async function run() {
  const root = globalThis;
  const modelName = 'models/trionfo_v14.onnx';
  root.document = {baseURI: 'http://localhost:8000/trionfo_browser_game_v8_v14/index.html'};
  root.ort = {
    env: {wasm: {}},
    InferenceSession: {
      create: async (modelPath, options) => {
        assert.equal(modelPath, modelName);
        assert.deepEqual(options.executionProviders, ['wasm']);
        assert.equal(root.ort.env.wasm.numThreads, 1);
        assert.equal(root.ort.env.wasm.wasmPaths,
          'http://localhost:8000/trionfo_browser_game_v8_v14/vendor/');
        assert(!root.ort.env.wasm.wasmPaths.startsWith('vendor/'));
        return {inputNames:['observation'], outputNames:['card_logits', 'trump_logits', 'card_q', 'trump_q']};
      }
    }
  };
  const tutor = new TutorEngine();
  assert.equal(await tutor.init(), true);
  assert.equal(tutor.mode, 'onnx');
  assert.match(tutor.status, /V14 ONNX attiva/);

  root.document.baseURI = 'file:///C:/Users/test/index.html';
  const localTutor = new TutorEngine();
  assert.equal(await localTutor.init(), false);
  assert.match(localTutor.status, /start_server\.bat/);

  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert(html.includes('vendor/ort.wasm.min.js'), 'browser must load WASM-only build');
  assert(!html.includes('src="vendor/ort.min.js"'), 'old bundle must not be used');
  const install = fs.readFileSync(path.join(__dirname, '..', 'PREPARA_GITHUB_PAGES.ps1'), 'utf8');
  assert(install.includes("'ort.wasm.min.js'"));
  assert(install.includes("'ort-wasm-simd-threaded.mjs'"));
  assert(install.includes("'ort-wasm-simd-threaded.wasm'"));
  console.log('OK: ONNX Runtime absolute paths, WASM-only bundle and local-file guard');
}
run().catch(e => {console.error(e); process.exitCode = 1;});
