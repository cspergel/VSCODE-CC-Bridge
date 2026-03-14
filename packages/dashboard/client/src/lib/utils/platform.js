const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';

export const isIOS = /iPhone|iPad|iPod/.test(ua);
export const isAndroid = /Android/.test(ua);
export const isMobile = isIOS || isAndroid || (typeof window !== 'undefined' && window.innerWidth <= 768);
export const isSafari = isIOS && /WebKit/.test(ua) && !/CriOS/.test(ua);
export const isPWA = typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
   window.navigator.standalone === true);
