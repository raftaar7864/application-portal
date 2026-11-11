import { useLanguage, LanguageToggle } from '../i18n';
import React, { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, BriefcaseBusiness, CalendarDays, ChevronDown, FileText, Headphones, PhoneCall, LayoutDashboard, LogIn, LogOut, Menu, ShieldCheck, Trophy, Users, X } from 'lucide-react';
import { useAuth } from '../AuthContext';

export function Brand({ inverse = false, onNavigate }) { const { t } = useLanguage();
  return <Link to="/" onClick={() => { onNavigate?.(); window.scrollTo({ top: 0, behavior: 'auto' }); }} className={`brand ${inverse ? 'brand-inverse' : ''}`} aria-label={t("Career & Training home")}>
    <span className="brand-logos">
      <span className="brand-logo-frame brand-logo-jis"><img src="/images/jis-logo.jpg" alt={t("JIS Group Educational Initiatives")} width="56" height="56" /></span>
      <span className="brand-logo-frame brand-logo-narula"><img src="/images/narula-logo.jpg" alt={t("Narula Educational Trust")} width="160" height="121" /></span>
    </span>
    <span className="brand-label"><strong>{t("Career & Training")}</strong><small>{t("Recruitment Portal")}</small></span>
  </Link>;
}
export function Header() { const { t } = useLanguage();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  React.useEffect(() => setOpen(false), [location.pathname]);
  const links = [['/', 'Home'], ['/opportunities', 'Apply Online'], ['/memorandum', 'Memorandum'], ['/results', 'Selected List']];
  const accountLink = user?.role === 'admin' ? '/admin' : '/dashboard';
  return <>
    <div className="top-strip"><span>{t("Skill Development • Career Opportunities • Transparent Selection")}</span><span><ShieldCheck size={14} />{" " + t("Verified candidate accounts")}</span></div>
    <header className="site-header"><div className="container nav-inner">
      <Brand onNavigate={() => setOpen(false)} />
      <nav className={`nav-links ${open ? 'is-open' : ''}`} aria-label={t("Main navigation")}>
        {links.map(([to, label]) => <NavLink key={to} end={to === '/'} to={to} onClick={() => { if (to === '/') window.scrollTo(0, 0); }} className={({ isActive }) => isActive ? 'nav-active' : ''}>{t(label)}</NavLink>)}
        <div className="mobile-nav-actions">{user ? <><Link to={accountLink}>{t("My Dashboard")}</Link><button onClick={() => { logout(); navigate('/'); }} className="link-button">{t("Logout")}</button></> : <><Link to="/login">{t("Candidate Login")}</Link><Link to="/register">{t("Register")}</Link></>}</div>
      </nav>
      <div className="nav-actions"><LanguageToggle compact />{user ? <><Link className="nav-dashboard" to={accountLink}><LayoutDashboard size={17} />{" " + t("Dashboard")}</Link><button className="icon-button logout-button" title={t("Sign out")} onClick={() => { logout(); navigate('/'); }}><LogOut size={19} /></button></> : <><Link className="login-link" to="/login"><LogIn size={16} />{" " + t("Login")}</Link><Link className="btn btn-gold btn-sm" to="/register">{t("Register") + " "}<ArrowRight size={15} /></Link></>}</div>
      <div className="mobile-language-switch"><LanguageToggle compact /></div>
      <button className="icon-button mobile-menu" aria-label={t("Toggle menu")} onClick={() => setOpen(v => !v)}>{open ? <X size={23} /> : <Menu size={23} />}</button>
    </div></header>
  </>;
}
// Phone numbers are editable at build time without changing source code.
// Project numbers default to the numbers printed on the supplied training brochure.
const displayedPhone = value => String(value || '').trim();
const telephoneHref = value => `tel:${displayedPhone(value).replace(/[^0-9+]/g, '')}`;

export function Footer() {
  const { t } = useLanguage();
  const projectPhones = [
    import.meta.env.VITE_PROJECT_CONTACT_PHONE_1 ?? '8777561989',
    import.meta.env.VITE_PROJECT_CONTACT_PHONE_2 ?? '7044414004',
  ].map(displayedPhone).filter(Boolean);
  const technicalPhone = displayedPhone(import.meta.env.VITE_TECHNICAL_CONTACT_PHONE);

  return <footer className="site-footer">
    <div className="container footer-main">
      <div className="footer-about"><Brand inverse />
        <p>{t("A clear application and recruitment journey — from registration and screening to interviews and published results.")}</p>
        <p className="footer-trust">{t("JIS Group • Narula Educational Trust")}</p>
        <div className="footer-disclaimer">{t("Project demo based on supplied JIS/DDU-GKY materials. Confirm organizer authorization, contacts and programme terms before public launch.")}</div>
      </div>
      <div><h4>{t("Explore")}</h4><Link to="/opportunities">{t("Open opportunities")}</Link><Link to="/memorandum">{t("Memorandum / summary")}</Link><Link to="/results">{t("Selection list")}</Link></div>
      <div><h4>{t("Candidate Services")}</h4><Link to="/register">{t("New registration")}</Link><Link to="/login">{t("Candidate login")}</Link><Link to="/dashboard">{t("Track application")}</Link></div>
      <div><h4>{t("Programme reference")}</h4><p>{t("Deen Dayal Upadhyaya Grameen Kaushalya Yojana (DDU-GKY)")}</p><p>{t("Training duration: 4 months.")}<br />{t("Recruitment controlled by admin dates")}</p><p><strong>{t("Training Centre")}</strong><br />{t("Narula Educational Trust")}<br />{t("56, Jessore Road, Patipukur, Kolkata – 700048")}</p><p className="footer-scheme"><strong>DDU-GKY</strong> — {t("Deen Dayal Upadhyaya Grameen Kaushalya Yojana")}</p></div>
    </div>
    <div className="container footer-contacts" aria-label={t("Contact information")}>
      <div className="footer-contact-inline">
        <PhoneCall size={13} aria-hidden="true" />
        <span className="footer-contact-label">{t("Project Enquiries")}:</span>
        {projectPhones.length
          ? <span className="footer-contact-numbers">{projectPhones.map((phone, index) => <React.Fragment key={phone}>{index > 0 && <span className="footer-contact-separator">/</span>}<a href={telephoneHref(phone)}>{phone}</a></React.Fragment>)}</span>
          : <span className="footer-contact-pending">{t("Contact number will be updated soon")}</span>}
      </div>
      <div className="footer-contact-inline">
        <Headphones size={13} aria-hidden="true" />
        <span className="footer-contact-label">{t("Technical Support")}:</span>
        {technicalPhone
          ? <a href={telephoneHref(technicalPhone)}>{technicalPhone}</a>
          : <span className="footer-contact-pending">{t("Contact number will be updated soon")}</span>}
      </div>
    </div>
    <div className="container footer-bottom"><span>© {new Date().getFullYear()}{" " + t("Recruitment Portal")}</span><span>{t("Built for candidate-first recruitment")}</span></div>
  </footer>;
}
export function PublicLayout() {
  const location = useLocation();
  React.useEffect(() => {
    // Navigate to the top on each public page change; Home and brand links
    // also handle repeated clicks when the current route is already '/'.
    if (!location.hash) window.scrollTo(0, 0);
  }, [location.pathname, location.search]);
  return <><Header /><main id="main-content"><Outlet /></main><Footer /></>;
}
export function PageTop({ eyebrow, title, subtitle, children }) { const { t } = useLanguage(); return <section className="page-top"><div className="container page-top-content"><div className="eyebrow eyebrow-light">{t(eyebrow)}</div><h1>{t(title)}</h1>{subtitle && <p>{t(subtitle)}</p>}{children}</div></section>; }
export function SectionHeader({ eyebrow, title, body, action }) { const { t } = useLanguage(); return <div className="section-header"><div><span className="eyebrow">{t(eyebrow)}</span><h2>{t(title)}</h2>{body && <p>{t(body)}</p>}</div>{action}</div>; }
export function Pill({ children, tone = 'slate' }) { const { t } = useLanguage(); return <span className={`pill pill-${tone}`}>{typeof children === "string" ? t(children) : children}</span>; }
export function Spinner({ label = 'Loading...' }) { const { t } = useLanguage(); return <div className="loading"><span className="loading-spinner" />{t(label)}</div>; }
export function Empty({ icon: Icon = FileText, title, description, action }) { const { t } = useLanguage(); return <div className="empty-state"><span className="empty-icon"><Icon size={28} /></span><h3>{t(title)}</h3><p>{t(description)}</p>{action}</div>; }
export function Alert({ text, type = 'error' }) { const { t } = useLanguage(); return text ? <div className={`alert alert-${type}`} role="alert">{t(text)}</div> : null; }
export const phaseInfo = [
  { key: 'application', label: 'Apply online', icon: FileText, body: 'Register, verify email and complete the application.' },
  { key: 'screening', label: 'Shortlisting', icon: Users, body: 'Eligibility and document details are reviewed.' },
  { key: 'interview', label: 'Interview call', icon: CalendarDays, body: 'Candidates receive their schedule by dashboard and email.' },
  { key: 'selection', label: 'Final selection', icon: Trophy, body: 'Approved selections are published in the results list.' },
  { key: 'centre', label: 'Centre confirmed', icon: ShieldCheck, body: 'After joining, the centre issues its confirmation letter and the recruitment application closes.' }
];
