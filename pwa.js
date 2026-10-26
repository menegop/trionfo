/* Android install prompt + explicit complete offline download for V14. */
(() => {
  'use strict';
  const installBtn = document.getElementById('installAppBtn');
  const offlineBtn = document.getElementById('offlineSaveBtn');
  const status = document.getElementById('pwaStatus');
  let deferredPrompt = null;
  let registration = null;
  const show = message => { if (status) status.textContent = message; };
  const setReady = ready => { offlineBtn.textContent = ready ? 'Offline ✓' : 'Offline'; };

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    installBtn.classList.remove('hidden');
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installBtn.classList.add('hidden');
    show('Trionfo installato sul dispositivo.');
  });
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    const prompt = deferredPrompt;
    deferredPrompt = null;
    installBtn.classList.add('hidden');
    try { await prompt.prompt(); await prompt.userChoice; }
    catch (error) { show('Installazione: ' + error.message); }
  });

  function askWorker(type, onProgress) {
    const worker = navigator.serviceWorker.controller || registration?.active;
    if (!worker) return Promise.reject(new Error('Service Worker non attivo: aggiorna la pagina.'));
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      let timeout = setTimeout(() => {
        channel.port1.close(); reject(new Error('Tempo di download scaduto.'));
      }, 240000);
      channel.port1.onmessage = event => {
        const value = event.data || {};
        if (value.type === 'PROGRESS') { onProgress?.(value); return; }
        clearTimeout(timeout);
        channel.port1.close();
        if (value.type === 'ERROR') reject(new Error(value.error));
        else resolve(value);
      };
      worker.postMessage({type}, [channel.port2]);
    });
  }

  offlineBtn.addEventListener('click', async () => {
    if (!registration) { show('Per installare offline apri il sito su HTTPS e ricarica la pagina.'); return; }
    offlineBtn.disabled = true;
    show('Download modello V14 e runtime ONNX: servono diversi MB.');
    try {
      const response = await askWorker('OFFLINE_PREPARE', progress => {
        show(`Offline: scaricato ${progress.done}/${progress.total} (${progress.file.replace('./','')}).`);
      });
      setReady(response.ready);
      if (!response.ready) throw new Error('File offline incompleti');
      const currentStatus = document.getElementById('modelStatus')?.textContent || '';
      show('Offline pronto: carte, V14 e runtime salvati nel dispositivo.' + (currentStatus.includes('non attiva') ? ' Ricarica la pagina per riattivare la V14.' : ''));
      if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
    } catch (error) {
      setReady(false);
      show(`Offline non completo: ${error.message}. Controlla che tutti i file siano stati caricati su GitHub.`);
    } finally { offlineBtn.disabled = false; }
  });

  async function init() {
    if (!('serviceWorker' in navigator)) {
      offlineBtn.disabled = true;
      show('Questo browser non supporta il salvataggio offline.');
      return;
    }
    if (location.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(location.hostname)) {
      offlineBtn.disabled = true;
      show('Per installare la PWA è necessario HTTPS (GitHub Pages).');
      return;
    }
    try {
      registration = await navigator.serviceWorker.register('./sw.js', {scope:'./'});
      await navigator.serviceWorker.ready;
      const response = await askWorker('OFFLINE_STATUS');
      setReady(Boolean(response.ready));
    } catch (error) {
      offlineBtn.disabled = true;
      show('PWA non attiva: ' + error.message);
    }
  }
  init();
})();
