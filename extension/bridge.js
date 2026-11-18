// Dias Ajan bridge: runs only on /dias-claude.html and passes messages
// between the panel page (window.postMessage) and the service worker (port).
(function () {
  var port = null;
  function connect() {
    port = chrome.runtime.connect({ name: 'dias-panel' });
    port.onMessage.addListener(function (msg) {
      window.postMessage({ dias: 'from-agent', msg: msg }, location.origin);
    });
    // The worker sleeps when idle; reconnect so the panel keeps its link.
    port.onDisconnect.addListener(function () { port = null; setTimeout(connect, 1000); });
  }
  connect();
  window.addEventListener('message', function (e) {
    if (e.source !== window || e.origin !== location.origin || !e.data || e.data.dias !== 'to-agent') return;
    if (!port) connect();
    port.postMessage(e.data.msg);
  });
})();
