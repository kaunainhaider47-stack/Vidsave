(() => {
  'use strict';

  const form = document.querySelector('#download-form');
  const input = document.querySelector('#video-url');
  const pasteButton = document.querySelector('#paste-btn');
  const downloadButton = document.querySelector('#download-btn');
  const buttonLabel = document.querySelector('.button-label');
  const message = document.querySelector('#form-message');

  if (!form || !input || !pasteButton || !downloadButton || !buttonLabel || !message) return;

  const setMessage = (text, type = 'error') => {
    message.textContent = text;
    message.dataset.state = type;
    message.style.color = type === 'success' ? '#9ee7bd' : type === 'loading' ? '#b8cfff' : '#ffb7c4';
  };

  const validUrl = (value) => {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname);
    } catch (_) {
      return false;
    }
  };

  pasteButton.addEventListener('click', async () => {
    pasteButton.disabled = true;
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error('Clipboard unavailable');
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        setMessage('Your clipboard is empty.');
      } else {
        input.value = text;
        setMessage('Link pasted. Confirm you have permission to use it.', 'success');
      }
      input.focus();
    } catch (_) {
      setMessage('Paste permission is unavailable. Use your device’s Paste command instead.');
      input.focus();
    } finally {
      pasteButton.disabled = false;
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!validUrl(value)) {
      setMessage('Please enter a valid http:// or https:// video URL.');
      input.focus();
      return;
    }

    downloadButton.disabled = true;
    buttonLabel.textContent = 'Checking…';
    setMessage('Checking the link. No download will start automatically.', 'loading');

    // This front-end intentionally does not fetch or download third-party content.
    // A permitted backend can be connected here after authorization checks.
    await new Promise((resolve) => window.setTimeout(resolve, 450));
    buttonLabel.textContent = 'Download';
    downloadButton.disabled = false;
    setMessage('Please confirm you own this content or have permission to download it before continuing.', 'success');
  });
})();
