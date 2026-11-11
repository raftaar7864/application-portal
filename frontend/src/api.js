const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');

export async function api(path, options = {}) {
  const { body, ...rest } = options;
  const token = sessionStorage.getItem('recruitment_token');
  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...rest.headers
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
  if (!response.ok) {
    const error = new Error(data.message || `Request failed: ${response.status}`);
    error.status = response.status;
    error.code = data.code;
    error.data = data;
    throw error;
  }
  return data;
}

export async function downloadCSV(campaignId) {
  const response = await fetch(`${API_URL}/admin/applications/export.csv${campaignId ? `?campaignId=${encodeURIComponent(campaignId)}` : ''}`, {
    headers: { Authorization: `Bearer ${sessionStorage.getItem('recruitment_token') || ''}` }
  });
  if (!response.ok) throw new Error('Could not export applications');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'recruitment-applications.csv'; a.click();
  URL.revokeObjectURL(url);
}

export const dateText = (s) => s ? new Date(`${String(s).slice(0, 10)}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not set';
export const dateTimeText = (s) => s ? new Date(s).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not scheduled';
export const statusText = (s) => ({ submitted: 'Submitted', shortlisted: 'Shortlisted', interview_called: 'Interview called', interviewed: 'Interview completed', selected: 'Selected', joined_closed: 'Joined — recruitment closed', rejected: 'Not selected', application: 'Application open', screening: 'Screening', interview: 'Interview', selection: 'Final selection', completed: 'Completed' }[s] || s);
export const escapeValue = (s) => String(s ?? '');

// All official letters are authenticated PDF downloads. Do not expose tokens in URLs.
export async function downloadPDF(path, filename) {
  const token = sessionStorage.getItem('recruitment_token');
  const response = await fetch(`${API_URL}${path}`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, cache: 'no-store' });
  if (!response.ok) {
    let message = 'Could not download PDF';
    try { message = (await response.json()).message || message; } catch {}
    throw new Error(message);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Secure raw-PDF submission: the training centre, not this portal, issues the letter.
export async function uploadCentreLetter(applicationId, { file, centreName, issuedDate }) {
  if (!file || file.size > 5 * 1024 * 1024 || file.size < 20 || !/\.pdf$/i.test(file.name)) {
    throw new Error('Choose a PDF file not larger than 5 MB');
  }
  const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  if (String.fromCharCode(...header) !== '%PDF-') throw new Error('Selected document is not a PDF');
  const query = new URLSearchParams({ centreName, issuedDate });
  const response = await fetch(`${API_URL}/admin/applications/${encodeURIComponent(applicationId)}/centre-letter?${query}`, {
    method: 'POST', headers: { Authorization: `Bearer ${sessionStorage.getItem('recruitment_token') || ''}`, 'Content-Type': 'application/pdf' },
    body: file
  });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data.message || `Upload failed (${response.status})`);
  return data;
}
