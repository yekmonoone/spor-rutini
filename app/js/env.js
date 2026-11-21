// Cihaz / kurulum durumu.

export function isIOS() {
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Ana ekrana eklenmiş uygulama olarak mı açıldı? */
export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}

export function isTouch() {
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}
