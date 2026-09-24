(() => {
  'use strict';

  const form = document.querySelector('#download-form');
  const input = document.querySelector('#video-url');
  const pasteButton = document.querySelector('#paste-btn');
  const downloadButton = document.querySelector('#download-btn');
  const buttonLabel = document.querySelector('.button-label');
  const message = document.querySelector('#form-message');
  const menuButton = document.querySelector('#menu-button');
  const siteMenu = document.querySelector('#site-menu');
  const apiUrl = window.VIDSAVE_API_URL || '/api/download';

  const setMenuState = (open) => {
    if (!menuButton || !siteMenu) return;
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    siteMenu.classList.toggle('is-open', open);
    siteMenu.setAttribute('aria-hidden', String(!open));
  };

  if (menuButton && siteMenu) {
    menuButton.addEventListener('click', (event) => {
      event.stopPropagation();
      setMenuState(menuButton.getAttribute('aria-expanded') !== 'true');
    });
    siteMenu.addEventListener('click', (event) => {
      if (event.target.closest('a')) setMenuState(false);
    });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.menu-wrap')) setMenuState(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setMenuState(false);
    });
  }

  if (!form || !input || !pasteButton || !downloadButton || !buttonLabel || !message) return;

  const setMessage = (text, type = 'error') => {
    message.textContent = text;
    message.dataset.state = type;
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
      if (!text) setMessage('Your clipboard is empty.');
      else { input.value = text; setMessage('Link pasted. Confirm you have permission to use it.', 'success'); }
      input.focus();
    } catch (_) {
      setMessage('Paste permission is unavailable. Use your device’s Paste command instead.');
      input.focus();
    } finally { pasteButton.disabled = false; }
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
    pasteButton.disabled = true;
    buttonLabel.textContent = 'Preparing…';
    setMessage('Checking the authorized file and preparing your download…', 'loading');

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/octet-stream, application/json' },
        body: JSON.stringify({ url: value })
      });

      if (!response.ok) {
        let error = 'The file could not be downloaded.';
        try { error = (await response.json()).error || error; } catch (_) { /* non-JSON server error */ }
        throw new Error(error);
      }

      const blob = await response.blob();
      if (!blob.size) throw new Error('The server returned an empty file.');
      const disposition = response.headers.get('Content-Disposition') || '';
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || 'vidsave-download';
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
      setMessage('Download ready. Please use the file only as permitted by its owner.', 'success');
    } catch (error) {
      setMessage(error.name === 'TypeError' ? 'The download service is unavailable. Please try again later.' : error.message);
    } finally {
      buttonLabel.textContent = 'Download';
      downloadButton.disabled = false;
      pasteButton.disabled = false;
    }
  });
})();
