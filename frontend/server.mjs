/** Production static server for a React Router/Vite SPA on Railway. */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = resolve(fileURLToPath(new URL('./dist', import.meta.url)));
const port = Number(process.env.PORT || 3000);
const mime = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.xml':'application/xml; charset=utf-8', '.txt':'text/plain; charset=utf-8',
  '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg', '.webp':'image/webp', '.ico':'image/x-icon',
  '.woff':'font/woff', '.woff2':'font/woff2', '.gif':'image/gif',
  '.pdf':'application/pdf', '.webmanifest':'application/manifest+json'
};

createServer(async (req,res) => {
  if (!['GET','HEAD'].includes(req.method)) {
    res.writeHead(405, {'Allow':'GET, HEAD'});return res.end();
  }
  let pathname;
  try { pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname); }
  catch { res.writeHead(400); return res.end('Bad request'); }
  if (pathname.includes('\0')) {res.writeHead(400);return res.end('Bad request');}
  const candidate=resolve(dist, '.'+pathname);
  const rel=relative(dist,candidate);
  if (rel.startsWith('..'+sep) || rel==='..' || isAbsolute(rel)) {
    res.writeHead(403);return res.end('Forbidden');
  }
  let file = candidate;
  try {
    const meta = await stat(file);
    if (meta.isDirectory()) file=resolve(file, 'index.html');
    else if (!meta.isFile()) throw new Error('Not a file');
    await stat(file);
  } catch {
    const accept=req.headers.accept || '';
    if (extname(pathname) || !accept.includes('text/html')) {
      res.writeHead(404);return res.end('Not found');
    }
    file=resolve(dist,'index.html');
  }
  try {
    const body=await readFile(file);
    const ext=extname(file).toLowerCase();
    const immutable=pathname.startsWith('/assets/') && ext!=='.html';
    const privateRoute=/^\/(admin(?:\/|$)|dashboard(?:\/|$)|apply(?:\/|$)|login(?:\/|$)|register(?:\/|$)|verify-email(?:\/|$)|forgot-password(?:\/|$))/.test(pathname);
    res.writeHead(200, {
      ...(privateRoute ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}),
      'Content-Type':mime[ext] || 'application/octet-stream',
      'Content-Length':body.length,
      'Cache-Control':immutable?'public, max-age=31536000, immutable':'no-cache',
      'X-Content-Type-Options':'nosniff'
    });
    return res.end(req.method==='HEAD'?undefined:body);
  } catch (error) {
    console.error('Static file error:',error.message);
    res.writeHead(500);return res.end('Server error');
  }
}).listen(port,'0.0.0.0',()=>console.log(`Recruitment web ready on 0.0.0.0:${port}`));
