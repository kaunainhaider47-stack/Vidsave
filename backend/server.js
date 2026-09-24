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

function positiveInt(value, fallback) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : fallback; }
function csv(name, fallback = '') { return (process.env[name] || fallback).split(',').map((value) => value.trim().toLowerCase()).filter(Boolean); }
function loadEnvFile() {
  try { for (const line of fs.readFileSync(path.join(publicDir, '.env'), 'utf8').split(/\r?\n/)) { const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/); if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, ''); } } catch (_) { /* .env is optional in hosted environments */ }
}
function corsHeaders(req) {
  const origin = req.headers.origin;
  const configured = csv('CORS_ORIGIN');
  return origin && configured.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
}
function json(req, res, status, body) { const data = JSON.stringify(body); res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...corsHeaders(req) }); res.end(data); }
function privateAddress(address) { const value = address.toLowerCase(); return value === 'localhost' || value === '::1' || value.startsWith('127.') || value.startsWith('10.') || value.startsWith('192.168.') || value.startsWith('169.254.') || value.startsWith('172.16.') || value.startsWith('172.17.') || value.startsWith('172.18.') || value.startsWith('172.19.') || value.startsWith('172.2') || value.startsWith('172.30.') || value.startsWith('172.31.') || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:'); }
async function validateTarget(raw) {
  let target; try { target = new URL(raw); } catch (_) { return { error: 'Please enter a valid public video URL.' }; }
  if (!['http:', 'https:'].includes(target.protocol) || !target.hostname || target.username || target.password) return { error: 'Please enter a valid public video URL.' };
  const host = target.hostname.toLowerCase();
  if (pinterestHosts.has(host) || host.endsWith('.pinterest.com')) return { pinterest: true };
  if (!allowedHosts.has(host)) return { error: 'This source is not enabled. Configure an authorized media host on the server.' };
  try { const records = await dns.lookup(host, { all: true }); if (!records.length || records.some(({ address }) => privateAddress(address))) return { error: 'Private and internal network addresses are not allowed.' }; } catch (_) { return { error: 'The media host could not be verified.' }; }
  return { url: target };
}
function typeAllowed(type) { const mime = (type || '').split(';')[0].trim().toLowerCase(); return allowedTypes.some((allowed) => allowed.endsWith('/*') ? mime.startsWith(allowed.slice(0, -1)) : mime === allowed); }
function filename(url, type) { const candidate = path.basename(url.pathname).replace(/[^a-z0-9._-]/gi, '_').slice(0, 100); return candidate && candidate !== '_' ? candidate : (type.startsWith('video/') ? 'vidsave-video' : 'vidsave-file'); }
async function readJson(req) { let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 10000) throw Object.assign(new Error('Request is too large.'), { status: 413 }); } try { return JSON.parse(body); } catch (_) { throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 }); } }
async function download(req, res) {
  let payload; try { payload = await readJson(req); } catch (error) { return json(req, res, error.status || 400, { error: error.message }); }
  if (!payload || typeof payload.url !== 'string' || payload.url.length > 2048) return json(req, res, 400, { error: 'A single valid URL is required.' });
  const target = await validateTarget(payload.url);
  if (target.pinterest) return json(req, res, 422, { error: 'Unable to retrieve this Pinterest video. Use a public direct media URL you own or are authorized to retrieve; private, login-required, and DRM content is not supported.' });
  if (target.error) return json(req, res, 400, { error: target.error });
  let upstream; try { upstream = await fetch(target.url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'video/*,application/octet-stream' } }); } catch (_) { return json(req, res, 502, { error: 'The authorized file is unavailable right now.' }); }
  if (upstream.status >= 300 && upstream.status < 400) return json(req, res, 400, { error: 'Redirects are not accepted. Use the final authorized file URL.' });
  if (!upstream.ok) return json(req, res, upstream.status === 404 ? 404 : 502, { error: upstream.status === 404 ? 'The authorized file was not found.' : 'The file provider returned an error.' });
  const type = (upstream.headers.get('content-type') || '').toLowerCase(); const length = Number(upstream.headers.get('content-length') || 0);
  if (!typeAllowed(type)) return json(req, res, 415, { error: 'This URL does not point to an allowed video or file.' });
  if (length > MAX_BYTES) return json(req, res, 413, { error: 'The file is larger than the configured download limit.' });
  res.writeHead(200, { 'Content-Type': type.split(';')[0], 'Content-Disposition': `attachment; filename="${filename(target.url, type)}"`, ...(length ? { 'Content-Length': length } : {}), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...corsHeaders(req) });
  try { await pipeline(upstream.body, res, { signal: AbortSignal.timeout(TIMEOUT_MS) }); } catch (_) { if (!res.headersSent) json(req, res, 502, { error: 'The download was interrupted.' }); else res.destroy(); }
}
function serve(req, res) { const requested = req.url === '/' ? '/index.html' : req.url.split('?')[0]; const file = path.resolve(publicDir, `.${requested}`); if (!file.startsWith(`${publicDir}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile() || path.basename(file) === '.env') return json(req, res, 404, { error: 'Not found.' }); const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' }; res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' }); fs.createReadStream(file).pipe(res); }
const server = http.createServer((req, res) => { if (req.method === 'OPTIONS') { res.writeHead(204, { ...corsHeaders(req), 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }); return res.end(); } if (req.method === 'POST' && req.url === '/api/download') return download(req, res); if (req.method === 'GET') return serve(req, res); return json(req, res, 405, { error: 'Method not allowed.' }); });
server.listen(PORT, () => console.log(`VidSave API listening on port ${PORT}`));
