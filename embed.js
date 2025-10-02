(function () {
  if (typeof document === 'undefined') return;
  var script = document.currentScript || document.querySelector('script[src*="embed.js"]');
  if (!script) return;

  var defaultSrc = (function () {
    try {
      var url = new URL(script.src);
      url.pathname = url.pathname.replace(/[^/]*$/, '') + 'index.html';
      url.hash = '';
      return url.toString();
    } catch (err) {
      return 'index.html';
    }
  }());

  var gameSrc = script.getAttribute('data-game-src') || defaultSrc;
  var width = script.getAttribute('data-width') || '100%';
  var maxWidth = script.getAttribute('data-max-width') || '960px';
  var aspect = script.getAttribute('data-aspect') || '16/9';
  var allowFullscreen = script.getAttribute('data-allow-fullscreen') !== 'false';

  var ratioParts = aspect.split('/');
  var ratio = 16 / 9;
  if (ratioParts.length === 2) {
    var w = parseFloat(ratioParts[0]);
    var h = parseFloat(ratioParts[1]);
    if (w > 0 && h > 0) {
      ratio = h / w;
    }
  }

  var container = document.createElement('div');
  container.className = 'knrd-embed';
  container.style.position = 'relative';
  container.style.width = width;
  container.style.maxWidth = maxWidth;
  container.style.paddingTop = (ratio * 100) + '%';
  container.style.margin = script.getAttribute('data-center') === 'false' ? '0' : '0 auto';
  container.style.boxSizing = 'border-box';
  container.style.background = script.getAttribute('data-background') || 'transparent';

  var iframe = document.createElement('iframe');
  iframe.src = gameSrc;
  iframe.style.position = 'absolute';
  iframe.style.top = '0';
  iframe.style.left = '0';
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = '0';
  iframe.style.boxShadow = script.getAttribute('data-shadow') || '0 16px 32px rgba(0, 0, 0, 0.35)';
  iframe.setAttribute('loading', 'lazy');
  if (allowFullscreen) {
    iframe.setAttribute('allowfullscreen', 'true');
  }

  container.appendChild(iframe);

  var target = script.parentNode;
  if (target) {
    target.insertBefore(container, script);
  } else {
    document.body.appendChild(container);
  }

  if (script.getAttribute('data-remove-script') !== 'false') {
    script.remove();
  }
}());
