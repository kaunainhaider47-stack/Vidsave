# VidSave

VidSave preserves the existing pastel-gradient interface and provides a small Node.js API for downloading **direct media files you own or are authorized to retrieve**. It does not scrape Pinterest, bypass login/private content, bypass DRM, or generate fake files. A Pinterest Pin URL that cannot be retrieved within those limits returns a clear error.

> Download only videos you own or have permission to use.

## Local setup

1. Install Node.js 18.17 or newer.
2. Clone this repository and run `npm install` (there are no runtime dependencies).
3. Copy `.env.example` to `.env`.
4. Set `DOWNLOAD_ALLOWED_HOSTS` to exact media hostnames you own or are authorized to access. Do not add Pinterest endpoints or private services.
5. Run `npm start` and open `http://localhost:3000`.
6. Run `npm run check` before committing changes.

## Environment variables

- `PORT` — API/web server port; defaults to `3000`.
- `DOWNLOAD_ALLOWED_HOSTS` — required comma-separated exact hostnames for direct authorized media URLs. An empty value rejects direct downloads.
- `MAX_DOWNLOAD_BYTES` — maximum response size; defaults to 500 MB and is capped at 500 MB.
- `DOWNLOAD_TIMEOUT_MS` — upstream timeout in milliseconds; defaults to 30,000 and is capped at 60,000.
- `ALLOWED_CONTENT_TYPES` — comma-separated MIME patterns; defaults to `video/*,application/octet-stream`.
- `CORS_ORIGIN` — exact frontend origin(s), comma-separated, for a separately hosted frontend. Never use `*` in production.

Do not commit `.env`, tokens, cookies, API keys, or provider credentials.

## API

`POST /api/download` with JSON `{ "url": "https://authorized.example/video.mp4" }` returns a streamed attachment. It validates the scheme, credentials, host allowlist, DNS addresses, content type, size, timeout, and redirects. It rejects localhost/private IPs and Pinterest page URLs that would require platform extraction. Errors are JSON with suitable HTTP status codes.

## GitHub Pages and deployment

GitHub Pages can host only the static frontend; it cannot run `server.js`. For Pages:

1. Deploy this repository's Node server to a Node-compatible service such as Render, Railway, Fly.io, or a VPS.
2. Set the service's environment variables from `.env.example`, including a strict `CORS_ORIGIN` equal to the Pages origin (for example `https://kaunainhaider47-stack.github.io`).
3. Change `window.VIDSAVE_API_URL` in `config.js` to the HTTPS URL of the deployed API plus `/api/download`, then publish the frontend to Pages.
4. Keep HTTPS enabled on both origins and test the API preflight and download request.

For simplest production operation, deploy the whole repository to a Node host and keep the default same-origin `/api/download` configuration.

## Testing checklist

- Valid and invalid URL validation in the browser.
- Paste button on a secure context and manual-paste fallback.
- Pinterest URL returns the honest limitation message; no fake MP4 is created.
- Authorized direct media URL downloads with `Content-Disposition`.
- Unauthorized hosts, redirects, oversized files, unsupported MIME types, localhost, private IPs, and malformed JSON are rejected.
- Verify mobile layout, menu keyboard behavior, loading state, duplicate-submit prevention, CORS origin, and `npm run check`.
