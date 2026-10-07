/* ComplaintCA — shared behaviour for /guides/*-guide.html pages. */
var _guideLastFocus = null;

function _guideOverlay(id){ return document.getElementById(id); }

function _guideOpen(overlay, modal){
  _guideLastFocus = document.activeElement;
  overlay.classList.add('show');
  var h = modal.querySelector('h2, h3');
  if (h) overlay.setAttribute('aria-label', h.textContent.trim());
  var btn = modal.querySelector('.mclose');
  if (btn) btn.focus();
}

function _guideClose(overlay){
  if (!overlay.classList.contains('show')) return;
  overlay.classList.remove('show');
  if (_guideLastFocus && _guideLastFocus.focus) _guideLastFocus.focus();
  _guideLastFocus = null;
}

function openStep(id){
  document.querySelectorAll('.step-modal').forEach(function(m){m.style.display='none'});
  var modal = document.getElementById(id);
  modal.style.display='block';
  _guideOpen(_guideOverlay('step-overlay'), modal);
}
function closeStep(){
  _guideClose(_guideOverlay('step-overlay'));
}
function openInfo(){
  var overlay = _guideOverlay('info-overlay');
  _guideOpen(overlay, overlay.querySelector('.info-modal'));
}
function closeInfo(){
  _guideClose(_guideOverlay('info-overlay'));
}

(function(){
  function openOverlay(){
    return document.querySelector('.step-overlay.show, .info-overlay.show');
  }

  function init(){
    // Non-link cards and the "More info" trigger act as buttons: make them reachable by keyboard.
    document.querySelectorAll('.path-card:not(a), .more-link').forEach(function(el){
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.addEventListener('keydown', function(e){
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
      });
    });
    document.querySelectorAll('.step-overlay, .info-overlay').forEach(function(o){
      o.setAttribute('role', 'dialog');
      o.setAttribute('aria-modal', 'true');
    });
    document.querySelectorAll('.mclose').forEach(function(b){
      b.setAttribute('type', 'button');
      b.setAttribute('aria-label', 'Close');
    });
  }

  document.addEventListener('keydown', function(e){
    var overlay = openOverlay();
    if (!overlay) return;
    if (e.key === 'Escape') {
      if (overlay.id === 'step-overlay') closeStep(); else closeInfo();
      return;
    }
    if (e.key !== 'Tab') return;
    // Keep focus inside the open dialog.
    var items = Array.prototype.filter.call(
      overlay.querySelectorAll('a[href], button, summary, input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      function(el){ return el.offsetParent !== null; }
    );
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!overlay.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
