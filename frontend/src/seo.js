/** SEO for the public pages; private/account routes are explicitly noindex. */
export const BRAND = 'JIS Group | Narula Educational Trust';
export const DEFAULT_IMAGE = '/images/training-brochure.jpeg';

export function normalizeSiteUrl(value) {
  try {
    const u = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.search || u.hash) return '';
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return '';
    return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
  } catch { return ''; }
}
export const SITE_URL = normalizeSiteUrl(import.meta.env.VITE_SITE_URL);
const en = {
  home: ['DDU-GKY Training & Recruitment Opportunities in West Bengal', 'Deen Dayal Upadhyaya Grameen Kaushalya Yojana (DDU-GKY): explore published training opportunities, district eligibility and application dates.'],
  opportunities: ['Training & Recruitment Programmes', 'Browse published DDU-GKY (Deen Dayal Upadhyaya Grameen Kaushalya Yojana) training notices. Check admission dates, eligibility and eligible districts.'],
  memorandum: ['Programme Memorandum & Application Guidelines', 'Read published recruitment programme summaries, application deadlines, required documents, district eligibility and important instructions.'],
  results: ['Published Selection Results', 'See publicly released selection results for completed recruitment stages. Candidate information is displayed according to publication consent.'],
  detail: ['Training Programme Details', 'Read the published training notice, eligibility criteria, application dates and recruitment stages before applying.']
};
const bn = {
  home: ['DDU-GKY প্রশিক্ষণ ও নিয়োগের সুযোগ', 'দীনদয়াল উপাধ্যায় গ্রামীণ কৌশল্যা যোজনা (DDU-GKY): প্রশিক্ষণ, যোগ্যতা, জেলার নিয়ম ও আবেদনের সময়সীমা দেখুন।'],
  opportunities: ['প্রশিক্ষণ ও নিয়োগ কর্মসূচি', 'পশ্চিমবঙ্গের প্রকাশিত প্রশিক্ষণ বিজ্ঞপ্তি, আবেদনের তারিখ, যোগ্যতা এবং অনুমোদিত স্থায়ী জেলার তথ্য দেখুন।'],
  memorandum: ['কর্মসূচির স্মারকলিপি ও আবেদনের নির্দেশিকা', 'প্রকাশিত বিজ্ঞপ্তির সারসংক্ষেপ, আবেদনের সময়সীমা, প্রয়োজনীয় নথি এবং যোগ্যতার শর্ত পড়ুন।'],
  results: ['প্রকাশিত নির্বাচনের ফলাফল', 'প্রকাশিত নির্বাচিত প্রার্থীদের ফলাফল দেখুন। প্রকাশের সম্মতি অনুযায়ী প্রার্থীর তথ্য দেখানো হয়।'],
  detail: ['প্রশিক্ষণ কর্মসূচির বিস্তারিত', 'আবেদনের আগে বিজ্ঞপ্তি, যোগ্যতা, তারিখ এবং নিয়োগের ধাপ পড়ুন।']
};
export const SEO_TEXT = { en, bn };

export function routeSeo(pathname, language = 'en') {
  const path = pathname.replace(/\/+$/, '') || '/';
  const locale = language === 'bn' ? bn : en;
  let key;
  if (path === '/') key = 'home';
  else if (path === '/opportunities') key = 'opportunities';
  else if (/^\/opportunities\/[a-f\d]{24}$/i.test(path)) key = 'detail';
  else if (path === '/memorandum') key = 'memorandum';
  else if (path === '/results') key = 'results';
  else return { title: 'Candidate Services', description: 'Private candidate and recruitment administration services.', indexable: false, path };
  const [title, description] = locale[key];
  return { title, description, indexable: true, path, key };
}

function ensureMeta(selector, field, value) {
  let tag = document.head.querySelector(selector);
  if (!tag) { tag = document.createElement('meta'); tag.setAttribute(field, value); document.head.appendChild(tag); }
  return tag;
}
function metaName(name, value) {
  const tag = ensureMeta(`meta[name="${name}"]`, 'name', name);
  tag.setAttribute('content', value);
}
function metaProperty(property, value) {
  const tag = ensureMeta(`meta[property="${property}"]`, 'property', property);
  tag.setAttribute('content', value);
}

/** Replaces stale metadata and JSON-LD on every SPA navigation, never duplicates tags. */
export function applySeo(data) {
  if (typeof document === 'undefined') return;
  const { title, description, indexable = false, path = '/', type = 'website', schema = null, language = 'en' } = data;
  const fullTitle = `${title} | ${BRAND}`;
  const origin = SITE_URL || window.location.origin;
  const url = `${origin}${path}`;
  const ogImage = `${origin}${DEFAULT_IMAGE}`;
  document.title = fullTitle;
  document.documentElement.lang = language;
  metaName('description', description);
  metaName('robots', indexable ? 'index, follow, max-image-preview:large' : 'noindex, nofollow');
  metaProperty('og:type', type);
  metaProperty('og:site_name', BRAND);
  metaProperty('og:title', fullTitle);
  metaProperty('og:description', description);
  metaProperty('og:url', url);
  metaProperty('og:image', ogImage);
  metaProperty('og:image:alt', 'JIS and Narula Educational Trust training recruitment brochure');
  metaProperty('og:locale', language === 'bn' ? 'bn_IN' : 'en_IN');
  metaName('twitter:card', 'summary_large_image');
  metaName('twitter:title', fullTitle);
  metaName('twitter:description', description);
  metaName('twitter:image', ogImage);
  const oldCanonical = document.head.querySelector('link[rel="canonical"]');
  if (oldCanonical) oldCanonical.remove();
  // Do not generate a localhost or misleading canonical before production URL is configured.
  if (indexable && SITE_URL) {
    const canonical = document.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = `${SITE_URL}${path}`;
    document.head.appendChild(canonical);
  }
  document.getElementById('portal-jsonld')?.remove();
  if (indexable && schema && SITE_URL) {
    const el = document.createElement('script');
    el.id = 'portal-jsonld';
    el.type = 'application/ld+json';
    el.textContent = JSON.stringify(schema).replace(/</g, '\\u003c');
    document.head.appendChild(el);
  }
}

export function homeSchema() {
  if (!SITE_URL) return null;
  return {
    '@context': 'https://schema.org', '@graph': [
      { '@type': 'Organization', '@id': `${SITE_URL}/#organization`, name: 'JIS Group - Narula Educational Trust', url: SITE_URL },
      { '@type': 'WebSite', '@id': `${SITE_URL}/#website`, name: BRAND, url: SITE_URL, inLanguage: ['en-IN', 'bn-IN'], publisher: { '@id': `${SITE_URL}/#organization` } }
    ]
  };
}
export function trainingSchema(c) {
  if (!SITE_URL || !c?._id || !c?.published) return null;
  return {
    '@context': 'https://schema.org', '@type': 'EducationalOccupationalProgram',
    name: c.title, description: c.description,
    url: `${SITE_URL}/opportunities/${c._id}`,
    provider: { '@type': 'Organization', name: 'JIS Group - Narula Educational Trust' },
    programPrerequisites: c.qualification,
    occupationalCategory: c.department,
    ...(c.duration && /^\s*(\d+)\s*months?\s*$/i.test(c.duration) ? { timeToComplete: `P${Number(c.duration.match(/\d+/)[0])}M` } : {})
  };
}
