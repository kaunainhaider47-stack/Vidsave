const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const dns = require('node:dns').promises;
const { pipeline } = require('node:stream/promises');

loadEnvFile();

const PORT = positiveInt(process.env.PORT, 3000);
const MAX_BYTES = Math.min(positiveInt(process.env.MAX_DOWNLOAD_BYTES, 524288000), 524288000);
const TIMEOUT_MS = Math.min(positiveInt(process.env.DOWNLOAD_TIMEOUT_MS, 30000), 60000);
const allowedHosts = new Set(csv('DOWNLOAD_ALLOWED_HOSTS'));
const allowedTypes = csv('ALLOWED_CONTENT_TYPES', 'video/*,application/octet-stream');
const publicDir = path.resolve(__dirname, '..');
const pinterestHosts = new Set(['pinterest.com', 'www.pinterest.com', 'pin.it']);
const debugLogs = process.env.DEBUG_LOGS === 'true' || process.env.NODE_ENV !== 'production';

function positiveInt(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function csv(name, fallback = '') {
  return (process.env[name] || fallback).split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
}

function loadEnvFile() {
  try {
    const content = fs.readFileSync(path.join(publicDir, '.env'), 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch (_) {
    // .env is optional; deployment environment variables are supported.
  }
}

function log(event, details = {}) {
  if (debugLogs) console.error(`[vidsave] ${event} ${JSON.stringify(details)}`);
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  const configured = csv('CORS_ORIGIN');
  return origin && configured.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
}

function json(req, res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    ...corsHeaders(req),
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store'
  });
  res.end(data);
}

function privateAddress(address) {
  const value = address.toLowerCase().replace(/^\[|\]$/g, '');
  return value === 'localhost' || value === '::1' || value.startsWith('127.') || value.startsWith('10.') || value.startsWith('192.168.') || value.startsWith('169.254.') || value.startsWith('172.16.') || value.startsWith('172.17.') || value.startsWith('172.18.') || value.startsWith('172.19.') || value.startsWith('172.2') || value.startsWith('172.3') || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:');
}

async function validateTarget(raw) {
  let target;
  try { target = new URL(raw); } catch (_) { return { error: 'Please enter a valid public video URL.', code: 'INVALID_URL' }; }
  if (!['http:', 'https:'].includes(target.protocol) || !target.hostname || target.username || target.password) {
    return { error: 'Please enter a valid public video URL.', code: 'INVALID_URL' };
  }
  const host = target.hostname.toLowerCase();
  if (pinterestHosts.has(host) || host.endsWith('.pinterest.com')) return { pinterest: true, host };
  if (!allowedHosts.has(host)) return { error: `This source is not enabled: ${host} is not in DOWNLOAD_ALLOWED_HOSTS. Use a public direct media URL from an authorized host.`, code: 'HOST_NOT_ALLOWED' };
  try {
    const records = await dns.lookup(host, { all: true });
    if (!records.length || records.some(({ address }) => privateAddress(address))) return { error: 'Private and internal network addresses are not supported.', code: 'PRIVATE_ADDRESS' };
  } catch (error) {
    return { error: `The media host could not be resolved: ${error.code || error.message}.`, code: 'DNS_FAILED' };
  }
  return { url: target };
}

function typeAllowed(type) {
  const mime = (type || '').split(';')[0].trim().toLowerCase();
  return allowedTypes.some((allowed) => allowed.endsWith('/*') ? mime.startsWith(allowed.slice(0, -1)) : mime === allowed);
}

function filename(url, type) {
  const candidate = path.basename(url.pathname).replace(/[^a-z0-9._-]/gi, '_').slice(0, 100);
  return candidate && candidate !== '_' ? candidate : (type.startsWith('video/') ? 'vidsave-video.mp4' : 'vidsave-download');
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 10000) throw Object.assign(new Error('Request is too large.'), { status: 413 });
  }
  try { return JSON.parse(body); } catch (_) { throw new Error('Request body must be valid JSON.'); }
}

async function download(req, res) {
  let payload;
  try { payload = await readJson(req); } catch (error) {
    log('invalid-request', { status: error.status || 400, error: error.message });
    return json(req, res, error.status || 400, { error: error.message, code: 'INVALID_REQUEST' });
  }

  const rawUrl = typeof payload?.url === 'string' ? payload.url.trim() : '';
  log('download-request', { method: req.method, url: rawUrl });
  if (!rawUrl || rawUrl.length > 2048) return json(req, res, 400, { error: 'A single valid URL is required.', code: 'INVALID_URL' });

  const target = await validateTarget(rawUrl);
  log('target-validation', { inputUrl: rawUrl, host: target.host || target.url?.hostname || null, pinterest: Boolean(target.pinterest), error: target.error || null, code: target.code || null });
  if (target.pinterest) {
    const error = 'Pinterest Pin pages are not a direct media source. VidSave does not scrape Pinterest or bypass login, private, authorization, or DRM restrictions. Use a public direct media URL you own or are authorized to retrieve, or an approved user-authorized provider/API workflow.';
    log('media-url-unavailable', { inputUrl: rawUrl, reason: error });
    return json(req, res, 422, { error, code: 'PINTEREST_MEDIA_URL_UNAVAILABLE' });
  }
  if (target.error) return json(req, res, 400, { error: target.error, code: target.code });

  let upstream;
  try {
    upstream = await fetch(target.url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: 'video/*,application/octet-stream' }
    });
  } catch (error) {
    log('upstream-fetch-failed', { mediaUrl: target.url.href, error: error.name === 'TimeoutError' ? 'timeout' : error.message });
    return json(req, res, 502, { error: `The authorized media URL could not be fetched: ${error.name === 'TimeoutError' ? 'request timed out.' : error.message}`, code: 'UPSTREAM_FETCH_FAILED' });
  }

  const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
  const contentLength = Number(upstream.headers.get('content-length') || 0);
  log('upstream-response', { mediaUrl: target.url.href, status: upstream.status, statusText: upstream.statusText, contentType, contentLength: Number.isFinite(contentLength) ? contentLength : null });

  if (upstream.status >= 300 && upstream.status < 400) return json(req, res, 400, { error: 'Redirects are not accepted. Use the final authorized direct media URL.', code: 'REDIRECT_NOT_ALLOWED' });
  if (!upstream.ok) return json(req, res, upstream.status === 404 ? 404 : 502, { error: `The media provider returned HTTP ${upstream.status} ${upstream.statusText || 'error'}; no downloadable media stream was received.`, code: 'UPSTREAM_HTTP_ERROR' });
  if (!typeAllowed(contentType)) return json(req, res, 415, { error: `The URL returned ${contentType || 'no Content-Type'}, not an allowed video/media stream.`, code: 'UNSUPPORTED_MEDIA_TYPE' });
  if (contentLength > MAX_BYTES) return json(req, res, 413, { error: 'The file is larger than the configured download limit.', code: 'FILE_TOO_LARGE' });
  if (!upstream.body) return json(req, res, 502, { error: 'The provider returned no media stream.', code: 'EMPTY_MEDIA_STREAM' });

  res.writeHead(200, {
    ...corsHeaders(req),
    'Content-Type': contentType.split(';')[0],
    'Content-Disposition': `attachment; filename="${filename(target.url, contentType)}"`,
    ...(contentLength ? { 'Content-Length': contentLength } : {}),
    'Cache-Control': 'no-store'
  });
  try {
    await pipeline(upstream.body, res, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    log('download-complete', { mediaUrl: target.url.href, contentType, contentLength });
  } catch (error) {
    log('download-stream-failed', { mediaUrl: target.url.href, error: error.message });
    if (!res.destroyed) res.destroy(error);
  }
}

function serve(req, res) {
  const requested = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const file = path.resolve(publicDir, `.${requested}`);
  if (!file.startsWith(`${publicDir}${path.sep}`)) return res.writeHead(403).end('Forbidden');
  fs.readFile(file, (error, data) => {
    if (error) return res.writeHead(404).end('Not found');
    const type = file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': data.length });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...corsHeaders(req), 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Accept' });
    return res.end();
  }
  if (req.method === 'POST' && new URL(req.url, 'http://localhost').pathname === '/api/download') return download(req, res).catch((error) => { log('unhandled-error', { error: error.message, stack: error.stack }); if (!res.headersSent) json(req, res, 500, { error: 'The download service failed before a media stream was created.', code: 'INTERNAL_ERROR' }); else res.destroy(error); });
  if (req.method === 'GET') return serve(req, res);
  return json(req, res, 405, { error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' });
});

server.listen(PORT, () => console.log(`VidSave API listening on port ${PORT} (debug logs: ${debugLogs ? 'on' : 'off'})`));
