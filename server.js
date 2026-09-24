const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');

loadEnvFile();
const PORT = Number(process.env.PORT || 3000);
const MAX_BYTES = Number(process.env.MAX_DOWNLOAD_BYTES || 524288000);
const allowedHosts = new Set((process.env.DOWNLOAD_ALLOWED_HOSTS || '').split(',').map((host) => host.trim().toLowerCase()).filter(Boolean));
const allowedTypes = (process.env.ALLOWED_CONTENT_TYPES || 'video/*,application/octet-stream').split(',').map((type) => type.trim().toLowerCase()).filter(Boolean);
const publicDir = __dirname;

function loadEnvFile() {
  try {
    for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch (_) { /* .env is optional in production */ }
}

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data), 'Cache-Control': 'no-store', ...corsHeaders() });
  res.end(data);
}
function corsHeaders() {
  return process.env.CORS_ORIGIN ? { 'Access-Control-Allow-Origin': process.env.CORS_ORIGIN, Vary: 'Origin' } : {};
}
function validTarget(raw) {
  let url;
  try { url = new URL(raw); } catch (_) { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (!allowedHosts.has(host)) return null;
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1' || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return null;
  return url;
}
function typeAllowed(type) {
  const mime = (type || '').split(';')[0].trim().toLowerCase();
  return allowedTypes.some((allowed) => allowed.endsWith('/*') ? mime.startsWith(`${allowed.slice(0, -1)}`) : mime === allowed);
}
function safeFilename(url, type) {
  const candidate = path.basename(url.pathname).replace(/[^a-z0-9._-]/gi, '_').slice(0, 100);
  return candidate && candidate !== '_' ? candidate : (type.startsWith('video/') ? 'vidsave-video' : 'vidsave-file');
}
async function download(req, res) {
  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > 10000) return json(res, 413, { error: 'Request is too large.' }); }
  let payload;
  try { payload = JSON.parse(body); } catch (_) { return json(res, 400, { error: 'Request body must be valid JSON.' }); }
  const target = validTarget(payload.url);
  if (!target) return json(res, 400, { error: 'This URL is invalid or its host is not authorized by the server.' });

  let upstream;
  try { upstream = await fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(30000) }); }
  catch (_) { return json(res, 502, { error: 'The authorized file is unavailable right now.' }); }
  if (upstream.status >= 300 && upstream.status < 400) return json(res, 400, { error: 'Redirects are not accepted. Use the final authorized file URL.' });
  if (!upstream.ok) return json(res, upstream.status === 404 ? 404 : 502, { error: upstream.status === 404 ? 'The authorized file was not found.' : 'The file provider returned an error.' });
  const type = (upstream.headers.get('content-type') || '').toLowerCase();
  const length = Number(upstream.headers.get('content-length') || 0);
  if (!typeAllowed(type)) return json(res, 415, { error: 'This URL does not point to an allowed video or file.' });
  if (length > MAX_BYTES) return json(res, 413, { error: 'The file is larger than the configured download limit.' });
  res.writeHead(200, { 'Content-Type': type.split(';')[0], 'Content-Disposition': `attachment; filename="${safeFilename(target, type)}"`, ...(length ? { 'Content-Length': length } : {}), 'Cache-Control': 'no-store', ...corsHeaders() });
  try { await pipeline(upstream.body, res); } catch (_) { if (!res.headersSent) json(res, 502, { error: 'The download was interrupted.' }); else res.destroy(); }
}
function serve(req, res) {
  const requested = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const file = path.resolve(publicDir, `.${requested}`);
  if (!file.startsWith(publicDir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return json(res, 404, { error: 'Not found.' });
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}
const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, { ...corsHeaders(), 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }); return res.end(); }
  if (req.method === 'POST' && req.url === '/api/download') return download(req, res);
  if (req.method === 'GET') return serve(req, res);
  return json(res, 405, { error: 'Method not allowed.' });
});
server.listen(PORT, () => console.log(`VidSave listening on http://localhost:${PORT}`));
