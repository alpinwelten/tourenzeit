// Service-Worker registrieren (Offline-Fähigkeit). Fehler werden bewusst ignoriert.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
