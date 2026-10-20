'use strict';

let deferredInstallPrompt = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = $('installBtn');
  if (btn) btn.hidden = false;
});

const installBtn = $('installBtn');
if (installBtn) {
  installBtn.onclick = async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    try {
      await deferredInstallPrompt.userChoice;
    } catch (err) {}
    deferredInstallPrompt = null;
    installBtn.hidden = true;
  };
}

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const btn = $('installBtn');
  if (btn) btn.hidden = true;
  toast('Draw Studio instalado', 'ok');
});
