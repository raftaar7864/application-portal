import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function safeSiteUrl(raw) {
  try {
    const u = new URL(String(raw || '').trim());
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || ['localhost','127.0.0.1'].includes(u.hostname) || u.search || u.hash) return '';
    return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
  } catch { return ''; }
}
function escapeAttr(input) {
  return String(input).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const site = safeSiteUrl(env.VITE_SITE_URL);
  const verification = String(env.VITE_GOOGLE_SITE_VERIFICATION || '').trim();
  return {
    plugins: [
      react(),
      {
        name: 'portal-search-meta',
        transformIndexHtml: {
          order: 'pre',
          handler(html) {
            const extras = [];
            if (site) {
              extras.push(`<meta property="og:image" content="${escapeAttr(site)}/images/training-brochure.jpeg" />`);
              extras.push(`<meta name="twitter:image" content="${escapeAttr(site)}/images/training-brochure.jpeg" />`);
            }
            if (verification && /^[A-Za-z0-9+\/_=-]{8,200}$/.test(verification)) {
              extras.push(`<meta name="google-site-verification" content="${escapeAttr(verification)}" />`);
            }
            return html.replace('</head>', `  ${extras.join('\n    ')}\n  </head>`);
          }
        }
      }
    ],
    server: { port: 5173, strictPort: true }
  };
});
