// Installation guidance is public and does not depend on sign-in or push support.
export const isIosDevice = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandaloneApp = () => window.matchMedia('(display-mode: standalone)').matches
  || (navigator as Navigator & {standalone?: boolean}).standalone === true;
export const isIosEmbeddedBrowser = () => isIosDevice() && !isStandaloneApp()
  && (/Gmail|GSA\/|FBAN|FBAV|Instagram|Line\/|Outlook|Teams|WhatsApp/i.test(navigator.userAgent)
    || (!/Safari\//.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent)));
export const hrisInstallUrl = () => `${window.location.origin}/`;
