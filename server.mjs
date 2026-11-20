import http from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = path.dirname(fileURLToPath(import.meta.url));
function loadEnv() {
  if (process.env.CHAT_APP_PACKAGED === '1') return;
  const file = path.join(root, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
loadEnv();

const model = 'mistralai/mistral-small-3.2-24b-instruct';
const port = Number(process.env.PORT ?? 4174);
let activePort = port;
const dataDir = process.env.CHAT_APP_DATA_DIR || root;
export const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if ((req.url === '/api/chat' || req.url === '/api/image') && req.headers.origin === 'null') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }
  if (req.method === 'OPTIONS' && (req.url === '/api/chat' || req.url === '/api/image')) { res.writeHead(204); res.end(); return; }
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html' || req.url === '/app')) {
    try {
      const html = await readFile(path.join(root, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch { res.writeHead(500); res.end('Could not load the app.'); }
    return;
  }
  const pwaAssets = {
    '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json; charset=utf-8'],
    '/service-worker.js': ['service-worker.js', 'text/javascript; charset=utf-8'],
    '/mobile-icon.svg': ['mobile-icon.svg', 'image/svg+xml']
  };
  if (req.method === 'GET' && pwaAssets[req.url]) {
    const [name, type] = pwaAssets[req.url];
    try {
      const asset = await readFile(path.join(root, 'website', name));
      const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache' };
      if (req.url === '/service-worker.js') headers['Service-Worker-Allowed'] = '/';
      res.writeHead(200, headers);
      res.end(asset);
    } catch { res.writeHead(404); res.end('Not found'); }
    return;
  }
  if (req.method === 'GET' && ['/download', '/download/', '/download/index.html'].includes(req.url || '')) {
    try {
      const html = await readFile(path.join(root, 'website', 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(html);
    } catch { res.writeHead(500); res.end('Could not load the download page.'); }
    return;
  }
  if (req.method === 'GET' && req.url === '/download/windows') {
    const installer = path.join(root, 'release', 'Mistral Chat Setup 1.0.0.exe');
    try {
      const { size } = await stat(installer);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': size,
        'Content-Disposition': 'attachment; filename="Mistral-Chat-Setup-1.0.0.exe"',
        'X-Content-Type-Options': 'nosniff'
      });
      createReadStream(installer).pipe(res);
    } catch { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('The Windows installer is not available on this server yet.'); }
    return;
  }
  if (req.method === 'GET' && req.url === '/firebase-config.js') {
    try {
      const js = await readFile(path.join(root, 'firebase-config.js'));
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(js);
    } catch { res.writeHead(404); res.end('Not found'); }
    return;
  }
  if (req.method === 'GET' && /^\/generated\/[a-f0-9-]+\.(png|jpg|webp)$/.test(req.url || '')) {
    const file = path.join(dataDir, req.url.slice(1));
    try {
      const image = await readFile(file);
      const type = file.endsWith('.jpg') ? 'image/jpeg' : file.endsWith('.webp') ? 'image/webp' : 'image/png';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable' });
      res.end(image);
    } catch { res.writeHead(404); res.end('Not found'); }
    return;
  }
  if (req.method === 'POST' && req.url === '/api/chat') {
    if (!process.env.OPENROUTER_API_KEY) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'API key is not configured. Add OPENROUTER_API_KEY to .env and restart the server.' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1_000_000) req.destroy(); });
    req.on('end', async () => {
      try {
        const { messages } = JSON.parse(body || '{}');
        if (!Array.isArray(messages) || messages.length === 0 || messages.length > 80 || messages.some(m => !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid conversation.' }));
          return;
        }
        const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': `http://localhost:${activePort}`, 'X-Title': 'Mistral Chat' },
          body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 1800 })
        });
        const result = await upstream.json().catch(() => ({}));
        if (!upstream.ok) {
          res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: result?.error?.message || `OpenRouter returned ${upstream.status}.` }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ reply: result.choices?.[0]?.message?.content || '' }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message === 'fetch failed' ? 'The server could not reach OpenRouter. Check the network connection and try again.' : error.message || 'Could not reach OpenRouter.' }));
      }
    });
    return;
  }
  if (req.method === 'POST' && req.url === '/api/image') {
    if (!process.env.OPENROUTER_API_KEY) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'API key is not configured. Add OPENROUTER_API_KEY to .env and restart the server.' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 100_000) req.destroy(); });
    req.on('end', async () => {
      try {
        const { prompt, aspect_ratio = '1:1', resolution = '1K' } = JSON.parse(body || '{}');
        const ratios = new Set(['1:1','1:2','2:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9','9:19.5','19.5:9','9:20','20:9','9:21','21:9','auto']);
        if (typeof prompt !== 'string' || prompt.trim().length < 2 || prompt.length > 1600 || !ratios.has(aspect_ratio) || !['1K','2K'].includes(resolution)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Enter an image prompt under 1,600 characters and choose a supported size.' }));
          return;
        }
        const upstream = await fetch('https://openrouter.ai/api/v1/images', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': `http://localhost:${activePort}`, 'X-Title': 'Mistral Chat' },
          body: JSON.stringify({ model: 'bytedance-seed/seedream-5-0-flash', prompt: prompt.trim(), aspect_ratio, resolution })
        });
        const result = await upstream.json().catch(() => ({}));
        if (!upstream.ok) {
          res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: result?.error?.message || `OpenRouter returned ${upstream.status}.` }));
          return;
        }
        const generated = result.data?.[0];
        if (!generated?.b64_json) throw new Error('The image provider returned no image data.');
        const mime = generated.media_type || generated.mime_type || 'image/png';
        const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
        const id = randomUUID();
        const imageDir = path.join(dataDir, 'generated');
        await mkdir(imageDir, { recursive: true });
        await writeFile(path.join(imageDir, `${id}.${ext}`), Buffer.from(generated.b64_json, 'base64'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ imageUrl: `/generated/${id}.${ext}` }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message === 'fetch failed' ? 'The server could not reach OpenRouter. Check your network and try again.' : error.message || 'Image generation failed.' }));
      }
    });
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found');
});

export const serverReady = new Promise((resolve, reject) => {
  server.once('listening', () => { activePort = server.address().port; resolve(activePort); });
  server.once('error', error => { if (error.code === 'EADDRINUSE') resolve(port); else reject(error); });
});
server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.log(`A chat server is already using port ${port}. Open the existing app at http://localhost:${port}`);
    return;
  }
  console.error('Could not start the chat server:', error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`Chat app running at http://localhost:${activePort}`));
