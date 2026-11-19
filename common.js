/* ============================================================
   common.js — tiny shared script for the static site pages
   (about.html, privacy.html, terms.html, faq.html,
   changelog.html, 404.html).

   The main calculator (index.html) does NOT load this file;
   script.js already handles dark mode there.

   Loaded as an external file so it complies with the site's
   Content-Security-Policy (script-src 'self'; no inline JS).
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'ddhp_dark';

  function applyDark(on) {
    document.body.classList.toggle('dark', on);
    var btn = document.getElementById('btnDarkToggle');
    if (btn) btn.setAttribute('aria-pressed', String(on));
  }

  /* Sync with the calculator's stored theme on first paint. */
  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (err) { /* storage unavailable */ }
  applyDark(stored === 'true');

  /* Toggle button (present on every subpage header). */
  var toggle = document.getElementById('btnDarkToggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var on = !document.body.classList.contains('dark');
      applyDark(on);
      try { localStorage.setItem(KEY, String(on)); } catch (err) { /* ignore */ }
    });
  }

  /* Keep other open tabs of the site in sync. */
  window.addEventListener('storage', function (e) {
    if (e.key === KEY) applyDark(e.newValue === 'true');
  });

  /* Mark the current page's nav link. */
  var here = location.pathname.split('/').pop() || 'index.html';
  var links = document.querySelectorAll('.site-nav a');
  for (var i = 0; i < links.length; i++) {
    var target = links[i].getAttribute('href') || '';
    if (target === here || (here === '' && target === 'index.html')) {
      links[i].classList.add('current');
      links[i].setAttribute('aria-current', 'page');
    }
  }

})();
