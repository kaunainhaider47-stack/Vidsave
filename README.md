# VidSave

VidSave downloads only a real, direct, publicly accessible media stream from an exact allowlisted host. It does not create placeholder MP4 files, scrape Pinterest pages, bypass login/private access, bypass DRM, or use cookies/tokens to defeat access controls.

## Pinterest limitation and exact failure reason

A Pinterest Pin URL is a page URL, not a guaranteed direct media stream. The backend intentionally rejects it with HTTP `422` and error code `PINTEREST_MEDIA_URL_UNAVAILABLE`:

> Pinterest Pin pages are not a direct media source. VidSave does not scrape Pinterest or bypass login, private, authorization, or DRM restrictions. Use a public direct media URL you own or are authorized to retrieve, or an approved user-authorized provider/API workflow.

No Pinterest media URL is fetched or inferred by this project. To support content that you own, use an officially supported Pinterest API/provider or a user-authorized workflow that returns a permitted direct media URL. That URL must then be placed on an exact `DOWNLOAD_ALLOWED_HOSTS` allowlist. Do not add Pinterest hosts just to make the request pass.

## Local setup

1. Install Node.js 18.17 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and configure `DOWNLOAD_ALLOWED_HOSTS` with exact hosts serving media you own or are authorized to retrieve.
4. Run `npm start` and open `http://localhost:3000`.
5. Run `npm run check` before deployment.

The backend logs the submitted URL, validation result, upstream status, content type, and stream result when `DEBUG_LOGS=true` or when `NODE_ENV` is not `production`. Do not enable verbose logs in production if URLs are sensitive.

## Configuration and deployment

- `PORT`: API port, default `3000`.
- `DOWNLOAD_ALLOWED_HOSTS`: exact comma-separated direct-media hostnames; Pinterest, localhost, and private services are rejected.
- `MAX_DOWNLOAD_BYTES`: maximum response size, capped at 500 MB.
- `DOWNLOAD_TIMEOUT_MS`: upstream timeout, capped at 60 seconds.
- `ALLOWED_CONTENT_TYPES`: allowed MIME patterns, default `video/*,application/octet-stream`.
- `CORS_ORIGIN`: exact frontend origins when frontend and backend are separate; never use `*` in production.
- `DEBUG_LOGS`: set `true` for development diagnostics; keep it disabled in production unless necessary.

`config.js` controls the browser API URL. Same-origin deployments use `/api/download`. GitHub Pages cannot run Node.js, so deploy the backend to Render, Railway, Fly.io, or a VPS, set `CORS_ORIGIN` to the exact Pages origin, and set `window.VIDSAVE_API_URL` to the deployed HTTPS API endpoint in `config.js`.

## Testing and diagnosis

Run:

```bash
npm run check
npm start
```

For a Pinterest URL, expected behavior is a `422` JSON response and no file download. For an authorized direct media URL, the backend must receive a successful upstream response with an allowed video MIME type and a non-empty stream before the frontend enables a download. The frontend displays the backend's actual JSON `error` and logs the HTTP status/content type in the browser console.

Also verify the browser Network panel: the request URL matches `config.js`, the `OPTIONS` preflight has the expected CORS headers, and the `POST /api/download` response is either a real media stream or a JSON error. A JSON response can never be treated as a successful download.
