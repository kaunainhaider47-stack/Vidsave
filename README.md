# VidSave

VidSave is a static frontend plus a small Node.js backend for downloading **direct public media files that the user owns or is authorized to retrieve**. It does not scrape Pinterest, bypass login/private access, defeat DRM, or create fake downloads.

## 1. Local setup from zero

1. Install Node.js 18.17 or newer.
2. Clone the repository and enter it:
   ```bash
   git clone https://github.com/kaunainhaider47-stack/Vidsave.git
   cd Vidsave
   ```
3. Install dependencies (there are currently no runtime dependencies, but this keeps the workflow standard):
   ```bash
   npm install
   ```
4. Create your local environment file:
   ```bash
   cp .env.example .env
   ```
5. Set `DOWNLOAD_ALLOWED_HOSTS` to exact hostnames serving direct media files you own or are authorized to retrieve. Never add Pinterest hosts, localhost, or private services.
6. Start the combined local server:
   ```bash
   npm start
   ```
7. Open `http://localhost:3000`. The page and `/api/download` now use the same origin.
8. Run the syntax check before deployment:
   ```bash
   npm run check
   ```

## 2. API behavior and safety

`POST /api/download` accepts JSON `{ "url": "https://authorized.example/video.mp4" }` and streams the real response as an attachment only when the hostname is allowlisted, publicly resolvable, within the size/time limits, and has an allowed media type. It rejects malformed URLs, credentials in URLs, private/internal IPs, redirects, unsupported content, oversized responses, unavailable files, Pinterest page URLs, and login-required/private/DRM workflows. No fake file is returned when retrieval fails.

## 3. Environment variables

- `PORT` — API port; default `3000`.
- `DOWNLOAD_ALLOWED_HOSTS` — required comma-separated exact hostnames for authorized direct media files.
- `MAX_DOWNLOAD_BYTES` — response limit; default 500 MB, hard capped at 500 MB.
- `DOWNLOAD_TIMEOUT_MS` — upstream timeout; default 30,000 ms, hard capped at 60,000 ms.
- `ALLOWED_CONTENT_TYPES` — MIME patterns; default `video/*,application/octet-stream`.
- `CORS_ORIGIN` — exact comma-separated frontend origins when frontend and API are separate. Do not use `*` in production.

Do not commit `.env`, cookies, tokens, provider credentials, or API keys.

## 4. GitHub Pages deployment (frontend and backend are separate)

GitHub Pages can host the existing static frontend but cannot run Node.js or `backend/server.js`.

1. Deploy the repository's backend to Render, Railway, Fly.io, or a VPS. Use Node 18.17+.
2. Set its start command to `npm run start:api` (or `node backend/server.js`). Set the environment variables from `.env.example`, including a strict `CORS_ORIGIN` equal to the exact Pages origin.
3. In `config.js`, replace the value with the deployed HTTPS API endpoint:
   ```js
   window.VIDSAVE_API_URL = 'https://your-api.example.com/api/download';
   ```
   This is the only frontend API URL setting. Do not put secrets in it.
4. Publish the repository root as the Pages static source. `index.html` loads `config.js` before `app.js`, so the Download button calls the deployed backend.
5. Confirm the Pages origin and API both use HTTPS, and redeploy after changing `config.js`.

For the simplest setup, deploy the entire repository to a Node-compatible host using `npm start`; then leave `config.js` as `/api/download` and the frontend/backend are same-origin.

## 5. Complete test checklist

- Run `npm run check`.
- Start with `npm start`, open `http://localhost:3000`, and confirm the page loads without console import errors.
- Paste a malformed URL and confirm a validation error.
- Submit a Pinterest page URL and confirm the honest unsupported/public-authorized message; confirm no fake file downloads.
- With a test direct media host in `DOWNLOAD_ALLOWED_HOSTS`, submit a real public authorized video and confirm `Content-Disposition` download.
- Test an unlisted host, redirect, private IP, login-required URL, unsupported MIME type, oversized response, timeout, invalid JSON, and request larger than 10 KB.
- For Pages, test the browser Network panel: OPTIONS preflight has the expected CORS origin, POST targets `https://your-api.example.com/api/download`, and loading/success/error states are visible.
- Test paste fallback, duplicate-submit prevention, mobile layout, and keyboard menu behavior.
