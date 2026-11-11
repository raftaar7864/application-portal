import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api';
import { useLanguage } from '../i18n';
import { applySeo, homeSchema, routeSeo, trainingSchema } from '../seo';

/** Google can render Vite SPAs; this component updates metadata on each route change. */
export default function SeoManager() {
  const { pathname } = useLocation();
  const { language } = useLanguage();
  useEffect(() => {
    let cancelled = false;
    const page = routeSeo(pathname, language);
    applySeo({ ...page, language, schema: page.key === 'home' ? homeSchema() : null });
    const id = pathname.match(/^\/opportunities\/([a-f\d]{24})\/?$/i)?.[1];
    if (id) {
      api(`/public/campaigns/${id}`)
        .then(({ campaign: c }) => {
          if (cancelled) return;
          const description = `${c.description || ''} Eligibility: ${c.qualification || ''}. Eligible home districts: ${(c.allowedDistricts || []).join(', ')}. Application deadline: ${c.closesAt || 'see notice'}.`.slice(0, 270);
          applySeo({ title: c.title, description, indexable: true, path: `/opportunities/${id}`, type: 'article', language, schema: trainingSchema(c) });
        })
        .catch(() => {
          if (!cancelled) applySeo({ title: 'Programme unavailable', description: 'This programme is not publicly available.', path: `/opportunities/${id}`, indexable: false, language });
        });
    }
    return () => { cancelled = true; };
  }, [pathname, language]);
  return null;
}
