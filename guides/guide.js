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
// FAQ, sources and related guides are a regular section below the first screen.
function openInfo(){
  var info = document.getElementById('info');
  if (info) info.scrollIntoView();
}
function closeInfo(){}

(function(){
  function openOverlay(){
    return document.querySelector('.step-overlay.show');
  }

  function init(){
    // Non-link cards act as buttons: make them reachable by keyboard.
    document.querySelectorAll('.path-card:not(a)').forEach(function(el){
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.addEventListener('keydown', function(e){
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
      });
    });
    document.querySelectorAll('.step-overlay').forEach(function(o){
      o.setAttribute('role', 'dialog');
      o.setAttribute('aria-modal', 'true');
    });
    document.querySelectorAll('.mclose').forEach(function(b){
      b.setAttribute('type', 'button');
      b.setAttribute('aria-label', 'Close');
    });
    addAsya();
  }

  document.addEventListener('keydown', function(e){
    var overlay = openOverlay();
    if (!overlay) return;
    if (e.key === 'Escape') { closeStep(); return; }
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

  // "Ask Asya" box in the info section, reusing /guides/asya-widget.js.
  function addAsya(){
    var info = document.querySelector('.guide-info .info-modal');
    if (!info || document.getElementById('asya-guide-input')) return;
    var topic = document.title.replace(/\s*\|.*$/, '');
    window._GUIDE_SYSTEM_PROMPT = 'You are Asya, the ComplaintCA assistant. The user is reading the ComplaintCA guide "' + topic +
      '" and asks a question about a complaint or civic issue in Canada. In 2-3 short sentences, tell them which authority or process applies, ' +
      'and mention that ComplaintCA can help draft the complaint. Be concrete and concise, no preamble.';
    var box = document.createElement('div');
    box.className = 'asya-box';
    box.innerHTML =
      '<h2>Ask Asya</h2>' +
      '<div class="asya-bubble" id="asya-guide-msg" aria-live="polite">Still not sure what to do? Tell me what happened and I\'ll point you to the right place.</div>' +
      '<div class="asya-input-row">' +
        '<input type="text" class="asya-input" id="asya-guide-input" aria-label="Describe your issue" placeholder="Describe your issue in a sentence...">' +
        '<button type="button" class="asya-send" id="asya-guide-send" aria-label="Ask Asya">→</button>' +
      '</div>';
    var cta = info.querySelector('.cta');
    if (cta && cta.nextSibling) info.insertBefore(box, cta.nextSibling); else info.appendChild(box);
    var input = box.querySelector('#asya-guide-input');
    input.addEventListener('keydown', function(e){ if (e.key === 'Enter' && window.askAsyaGuide) window.askAsyaGuide(); });
    box.querySelector('#asya-guide-send').addEventListener('click', function(){ if (window.askAsyaGuide) window.askAsyaGuide(); });
    var sc = document.createElement('script');
    sc.src = '/guides/asya-widget.js';
    document.body.appendChild(sc);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
