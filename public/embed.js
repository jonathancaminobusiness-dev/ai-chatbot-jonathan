(function () {
  const CHAT_URL = window.JUMA_CHAT_URL || '';

  const iframe = document.createElement('iframe');
  iframe.src = CHAT_URL;
  iframe.style.cssText =
    'position:fixed;bottom:0;right:0;width:400px;height:600px;border:none;z-index:99999;background:transparent;';
  iframe.allow = 'clipboard-write';

  const toggle = document.createElement('button');
  toggle.innerHTML = '💬';
  toggle.style.cssText =
    'position:fixed;bottom:24px;right:24px;width:60px;height:60px;border-radius:50%;background:#25D366;color:white;border:none;cursor:pointer;font-size:28px;z-index:100000;box-shadow:0 4px 16px rgba(37,211,102,0.4);';

  let open = false;
  iframe.style.display = 'none';

  toggle.addEventListener('click', function () {
    open = !open;
    iframe.style.display = open ? 'block' : 'none';
    toggle.style.display = open ? 'none' : 'block';
  });

  // Listen for close events from the chat iframe
  window.addEventListener('message', function (e) {
    if (e.data === 'juma-close') {
      open = false;
      iframe.style.display = 'none';
      toggle.style.display = 'block';
    }
  });

  document.body.appendChild(iframe);
  document.body.appendChild(toggle);
})();
