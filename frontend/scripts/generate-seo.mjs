/** Build-time public sitemap. Never adds private candidate/admin URLs. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.env.NODE_ENV === 'development' ? 'development' : 'production';
// Reads the same common .env layers as Vite for these plain URL settings.
const fileEnv = {};
for (const file of ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]) {
  try {
    const content = await fs.readFile(path.join(root, file), 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let value = m[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      else value = value.replace(/\s+#.*$/, '');
      fileEnv[m[1]] = value;
    }
  } catch (err) { if (err.code !== 'ENOENT') throw err; }
}
const env = { ...fileEnv, ...process.env };
const publicPath = path.join(root, 'public');
const sitemapPath = path.join(publicPath, 'sitemap.xml');
const robotsPath = path.join(publicPath, 'robots.txt');

function validSite(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hostname === 'localhost' || url.hostname === '127.0.0.1') return '';
    if (url.search || url.hash) return '';
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch { return ''; }
}
const esc = x => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const siteUrl = validSite(env.VITE_SITE_URL);
await fs.mkdir(publicPath, { recursive: true });

if (!siteUrl) {
  // Do not expose fake example.com or localhost URLs in the sitemap.
  await fs.writeFile(robotsPath, 'User-agent: *\nAllow: /\n', 'utf8');
  await fs.rm(sitemapPath, { force: true });
  console.warn('[SEO] Set VITE_SITE_URL in frontend/.env.production before public deployment. Sitemap not generated.');
  process.exit(0);
}

const routes = ['/', '/opportunities', '/memorandum', '/results'].map(route => ({ route }));
const apiBase = (env.SEO_SITEMAP_API_URL || env.VITE_API_URL || '').replace(/\/+$/, '');
if (apiBase) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    let response;
    try { response = await fetch(`${apiBase}/public/campaigns`, { signal: ctrl.signal, headers: { Accept: 'application/json' } }); }
    finally { clearTimeout(timer); }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    for (const item of payload.campaigns || []) {
      if (item.published && /^[a-f\d]{24}$/i.test(item._id)) routes.push({ route: `/opportunities/${item._id}`, lastmod: item.updatedAt });
    }
  } catch (err) {
    console.warn('[SEO] Cannot read public programmes during build. Static public pages are still in sitemap:', err.message);
  }
}
const urls = routes.map(({ route, lastmod }) => {
  let date = '';
  if (lastmod && !Number.isNaN(Date.parse(lastmod))) date = `<lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>`;
  return `  <url><loc>${esc(`${siteUrl}${route}`)}</loc>${date}</url>`;
});
await fs.writeFile(sitemapPath, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`, 'utf8');
await fs.writeFile(robotsPath, `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`, 'utf8');
console.log(`[SEO] Sitemap created with ${routes.length} public page(s) for ${siteUrl}`);
