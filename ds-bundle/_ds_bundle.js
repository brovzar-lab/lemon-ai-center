/* @ds-bundle: {"globalName":"LemonDS","shape":"package","source":"design-sync-tokens","components":[]} */
/* Lemon Studios is synced as a token/brand design system: the value is the
   stylesheet (styles.css) — tokens, fonts, and the resolved utility/editorial
   class vocabulary. There are no importable React components in this bundle;
   designs are composed from the token classes. The global is defined so the
   app's self-check has a valid (empty) export surface. */
(function () {
  if (typeof window !== 'undefined') {
    window.LemonDS = window.LemonDS || {};
  }
})();
