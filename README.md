# VidSave

VidSave is a small frontend and backend for downloading direct video/file URLs that you own or are authorized to download. It does **not** extract media from platforms, bypass DRM, logins, paywalls, or other access controls.

## Run locally

1. Install Node.js 18 or newer.
2. Copy `.env.example` to `.env` and configure the host allowlist.
3. Start the backend:

```bash
npm start
```

4. Open `http://localhost:3000`.

The Node server serves the existing frontend and exposes `POST /api/download`. The frontend sends `{ "url": "https://..." }` and receives the authorized file as a browser download.

## Configuration

The server reads these environment variables:

- `PORT` — server port (default `3000`).
- `DOWNLOAD_ALLOWED_HOSTS` — comma-separated hostnames that your organization owns or has authorization to retrieve from. This is required; an empty value rejects downloads. Example: `media.example.com,cdn.example.com`.
- `MAX_DOWNLOAD_BYTES` — maximum response size (default `524288000`, 500 MB).
- `ALLOWED_CONTENT_TYPES` — optional comma-separated MIME types (default `video/*,application/octet-stream`).
- `CORS_ORIGIN` — optional frontend origin for a separately hosted frontend. Keep the default same-origin setup when possible.

For a separately hosted frontend, set `window.VIDSAVE_API_URL` in `config.js` to the deployed backend URL, then set the backend `CORS_ORIGIN` to that exact frontend origin.

## API behavior

`POST /api/download` validates an absolute HTTPS/HTTP URL, requires its hostname to be in `DOWNLOAD_ALLOWED_HOSTS`, rejects localhost/private-network targets, follows no redirects, checks the content type and size, and streams the response to the browser. Invalid URLs, disallowed hosts, unavailable files, oversized files, and upstream/server failures return a JSON error with an appropriate HTTP status.

The host allowlist is an authorization boundary, not a legal determination. Only add sources where you have permission. Do not configure it to access protected platform endpoints or use it to circumvent restrictions.
