const form = document.querySelector('#download-form');
const input = document.querySelector('#video-url');
const pasteButton = document.querySelector('#paste-btn');
const message = document.querySelector('#form-message');

function showMessage(text, isSuccess = false) {
  message.textContent = text;
  message.style.color = isSuccess ? '#9ee7bd' : '#ffb7c4';
}

pasteButton.addEventListener('click', async () => {
  try {
    if (!navigator.clipboard || !window.isSecureContext) throw new Error('Clipboard unavailable');
    const text = await navigator.clipboard.readText();
    input.value = text;
    input.focus();
    showMessage(text ? 'Link pasted — make sure you have permission to use it.' : 'Your clipboard is empty.');
  } catch (error) {
    input.focus();
    showMessage('Paste permission is unavailable. Press Ctrl/Cmd + V to paste.');
  }
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = input.value.trim();
  let url;
  try { url = new URL(value); } catch (error) { url = null; }
  if (!url || !['http:', 'https:'].includes(url.protocol)) {
    showMessage('Please enter a valid video URL first.');
    input.focus();
    return;
  }
  showMessage('Please confirm you own this content or have permission to download it. VidSave does not download unauthorized content.');
});
