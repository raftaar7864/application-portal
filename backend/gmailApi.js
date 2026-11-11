// Gmail API delivery for Railway Hobby (HTTPS, not SMTP).
// Uses an OAuth refresh token belonging to the authorized sender.
// No user-facing OAuth routes are needed: only your organization account authorizes once.
const nodemailer = require('nodemailer');

let cachedToken;
let refreshPromise;
const mimeTransport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' });

function envSettings() {
  const id = process.env.GMAIL_CLIENT_ID?.trim();
  const secret = process.env.GMAIL_CLIENT_SECRET?.trim();
  const refresh = process.env.GMAIL_REFRESH_TOKEN?.trim();
  const from = process.env.GMAIL_FROM?.trim();
  if (!id || !secret || !refresh || !from) {
    throw new Error('Gmail API not configured: set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, and GMAIL_FROM.');
  }
  return { id, secret, refresh, from };
}

async function refreshAccessToken() {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const { id, secret, refresh } = envSettings();
    const body = new URLSearchParams({
      client_id: id,
      client_secret: secret,
      refresh_token: refresh,
      grant_type: 'refresh_token'
    });
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) {
      // Do not log OAuth secrets or raw provider responses.
      let code = 'token_exchange_failed';
      try {
        const data = await response.json();
        if (typeof data.error === 'string' && /^[a-z_]+$/.test(data.error)) code = data.error;
      } catch {}
      throw new Error(`Gmail authorization failed (${response.status}, ${code}). Check OAuth consent mode and refresh token.`);
    }
    const data = await response.json();
    if (!data.access_token || typeof data.access_token !== 'string') throw new Error('Gmail OAuth response did not contain an access token.');
    cachedToken = { value: data.access_token, expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 3600) - 120) * 1000 };
    return cachedToken.value;
  })().finally(() => { refreshPromise = undefined; });
  return refreshPromise;
}

async function sendWithGmailApi({ to, subject, html, attachments = [] }) {
  const { from } = envSettings();
  // StreamTransport composes full RFC-compliant MIME, including PDF attachments,
  // but never opens an SMTP connection.
  const result = await mimeTransport.sendMail({ from, to, subject, html, attachments });
  const raw = Buffer.from(result.message).toString('base64url');
  const doSend = async (token) => fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
    signal: AbortSignal.timeout(30000)
  });
  let response = await doSend(await refreshAccessToken());
  if (response.status === 401) {
    cachedToken = undefined;
    response = await doSend(await refreshAccessToken());
  }
  if (!response.ok) {
    let reason = `HTTP ${response.status}`;
    try {
      const data = await response.json();
      if (typeof data?.error?.status === 'string') reason += ` ${data.error.status}`;
    } catch {}
    throw new Error(`Gmail API failed to send (${reason}). Check Gmail API enablement, gmail.send scope and sender access.`);
  }
  return true;
}

module.exports = { sendWithGmailApi };
