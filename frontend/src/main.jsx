import { useLanguage, LanguageProvider } from './i18n';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { PublicLayout, Spinner } from './components/Layout';
import { Home, Opportunities, ProgrammeDetails, PublicMemorandum, PublicResults } from './pages/PublicPages';
import { Register, VerifyEmail, Login, ForgotPassword } from './pages/AuthPages';
import { CandidateDashboard, ApplicationForm } from './pages/CandidatePages';
import { AdminLayout, AdminOverview, AdminCampaigns, AdminApplications, AdminMemorandum, AdminSelections } from './pages/AdminPages';
import SeoManager from './components/SeoManager';
import './styles.css';

function Guard({ roles, children }) { const { t } = useLanguage();
  const { user, initializing } = useAuth();
  const loc = useLocation();
  if (initializing) return <div className="container"><Spinner label="Checking your session..." /></div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (!roles.includes(user.role)) return <Navigate to={user.role === 'admin' ? '/admin' : '/dashboard'} replace />;
  return children;
}
function NotFound() { const { t } = useLanguage(); return <div className="container not-found"><div className="error-number">404</div><h1>{t("Page not found")}</h1><p>{t("This page may have moved or does not exist.")}</p><a className="btn btn-primary" href="/">{t("Back to homepage")}</a></div>; }
function App() {
  return <BrowserRouter><AuthProvider><SeoManager /><Routes>
    <Route element={<PublicLayout />}>
      <Route path="/" element={<Home />} /><Route path="/opportunities" element={<Opportunities />} /><Route path="/opportunities/:id" element={<ProgrammeDetails />} />
      <Route path="/memorandum" element={<PublicMemorandum />} /><Route path="/results" element={<PublicResults />} />
      <Route path="/register" element={<Register />} /><Route path="/verify-email" element={<VerifyEmail />} /><Route path="/login" element={<Login />} /><Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/dashboard" element={<Guard roles={['candidate']}><CandidateDashboard /></Guard>} />
      <Route path="/apply/:id" element={<Guard roles={['candidate']}><ApplicationForm /></Guard>} />
      <Route path="*" element={<NotFound />} />
    </Route>
    <Route path="/admin" element={<Guard roles={['admin']}><AdminLayout /></Guard>}>
      <Route index element={<AdminOverview />} /><Route path="campaigns" element={<AdminCampaigns />} /><Route path="applications" element={<AdminApplications />} />
      <Route path="memorandum" element={<AdminMemorandum />} /><Route path="selections" element={<AdminSelections />} />
    </Route>
  </Routes></AuthProvider></BrowserRouter>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><LanguageProvider><App /></LanguageProvider></React.StrictMode>);
