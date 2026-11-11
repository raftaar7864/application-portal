const nodemailer = require('nodemailer');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]);
const portal = () => (process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim().replace(/\/$/, '') + '/dashboard';
const org = () => process.env.RECRUITMENT_ORG_NAME || 'JIS Group - Narula Educational Trust';
const layout = (heading, greeting, content) => `<!doctype html><html><body style="margin:0;background:#f4f7fc;padding:28px 12px;font:15px Arial,Helvetica,sans-serif;color:#273953"><div style="max-width:620px;margin:auto;background:#fff;border:1px solid #e2e9f3;border-radius:15px;overflow:hidden"><div style="background:#1b346d;color:#fff;padding:25px 30px"><div style="font-size:12px;letter-spacing:1px;opacity:.8">${escapeHtml(org())}</div><h1 style="font-size:23px;margin:8px 0 0">${escapeHtml(heading)}</h1></div><div style="padding:28px 30px"><p>Dear ${escapeHtml(greeting)},</p>${content}<p style="margin:25px 0"><a href="${escapeHtml(portal())}" style="display:inline-block;background:#2455ad;padding:12px 20px;text-decoration:none;color:white;border-radius:8px;font-weight:bold">Open candidate dashboard</a></p><p style="font-size:13px;color:#52617a">For your security, sign in with your registered mobile number and password. Do not share any verification code.</p><p style="margin-bottom:0">Regards,<br><b>Recruitment Administration</b></p></div><div style="padding:15px 30px;background:#f1f5fb;color:#61718a;font-size:12px">This is an automated recruitment notification. Please keep your application ID for future reference.</div></div></body></html>`;
const pill = (label, value) => `<div style="padding:10px 14px;margin:9px 0;background:#f2f6ff;border-left:3px solid #3560ad"><span style="font-size:12px;color:#66748c">${escapeHtml(label)}</span><br><b>${escapeHtml(value)}</b></div>`;
let transporter;
/** HTTPS alternative to SMTP for Railway Free/Trial/Hobby. Requires a verified sender domain. */
async function sendWithResend({ to, subject, html, attachments }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!from) throw new Error('RESEND_FROM is required when RESEND_API_KEY is set.');
  const payload = {
    from, to: [to], subject, html,
    ...(attachments.length ? { attachments: attachments.map(a => ({
      filename: a.filename,
      content: Buffer.from(a.content).toString('base64'),
      ...(a.contentType ? { content_type: a.contentType } : {})
    })) } : {})
  };
  const response = await fetch('https://api.resend.com/emails', {
    method:'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type':'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) {
    let reason = `HTTP ${response.status}`;
    try { const data=await response.json(); reason=data.message || reason; } catch {}
    throw new Error(`Resend email delivery failed: ${reason}`);
  }
  return true;
}
async function sendMail({ to, subject, html, attachments = [], devCode }) {
  if (process.env.RESEND_API_KEY) return sendWithResend({to, subject, html, attachments});
  if (!process.env.SMTP_HOST) {
    if (process.env.NODE_ENV === 'production') throw new Error('SMTP is not configured on the server.');
    if (devCode) console.log(`[DEVELOPMENT ONLY] Email OTP for ${to}: ${devCode}`);
    else console.log(`[DEVELOPMENT ONLY] Mock email to ${to}: ${subject}`);
    return false;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE) === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    });
  }
  await transporter.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, html, attachments });
  return true;
}
async function sendOTP(to, name, code, purpose = 'verification') {
  const resetting = purpose === 'reset';
  return sendMail({ to, subject: resetting ? 'Password reset verification code' : 'Email verification — Recruitment Portal', devCode: code,
    html: layout(resetting ? 'Password reset' : 'Verify your email address', name,
      `<p>Use this one-time verification code to ${resetting ? 'reset your password' : 'activate your candidate account'}:</p><div style="font-size:31px;letter-spacing:8px;font-weight:bold;text-align:center;padding:20px;background:#f1f5ff;border-radius:8px">${escapeHtml(code)}</div><p><b>Valid for 10 minutes.</b> If you did not request this code, ignore the email.</p>`)
  });
}
async function sendApplicationReceived({ email, name, campaignTitle, applicationId, submittedAt, pdf }) {
  const { dateTime } = require('./letters');
  return sendMail({ to: email, subject: `Application received | ${applicationId} | ${campaignTitle}`,
    html: layout('Application acknowledgement', name,
      `<p>Your online application has been <b>successfully received</b>. Thank you for applying.</p>${pill('Application ID', applicationId)}${pill('Recruitment programme', campaignTitle)}${pill('Submitted on', dateTime(submittedAt))}<p><b>PDF acknowledgement attached.</b> Save or print it for your records. Submission does not guarantee eligibility or selection.</p><p>Future screening decisions and interview calls will be available in your dashboard. If invited, you must bring a printed interview call letter to the interview venue.</p>`),
    attachments: pdf ? [{ filename: `Acknowledgement-${applicationId}.pdf`, content: pdf, contentType: 'application/pdf' }] : []
  });
}
async function sendStatusEmail({ email, name, title, applicationId, status, interview, letterPdf }) {
  const { dateTime } = require('./letters');
  const titleByStatus = { shortlisted: 'Shortlisting update', interview_called: 'Interview call letter issued', interviewed: 'Interview attendance updated', selected: 'Congratulations! You have been selected', rejected: 'Recruitment application update' };
  const intro = {
    shortlisted: 'Your application has been shortlisted for the next stage. Additional information will be provided on your dashboard.',
    interview_called: 'You are invited to attend an interview. Please see your schedule below and the attached interview call letter.',
    interviewed: 'Your interview stage has been marked complete. The selection decision will be communicated through the portal.',
    selected: '<b>Congratulations!</b> You have been selected for the recruitment programme shown below. Your selection status is now visible on your dashboard. A joining letter, if applicable, will be issued separately with reporting instructions.',
    rejected: 'Your application was not selected at this stage. Thank you for your interest and participation.'
  };
  const details = status === 'interview_called' && interview ? `${pill('Interview date & time', dateTime(interview.scheduledAt))}${pill('Interview venue', interview.venue)}<p><b>Important:</b> You MUST carry a printed copy of your attached interview call letter on interview day. Bring original identity proof, educational/age certificates and photocopies. Please arrive at least 30 minutes early.</p>${interview.note ? `<p><b>Additional instructions:</b> ${escapeHtml(interview.note)}</p>` : ''}` : '';
  return sendMail({ to: email, subject: `${titleByStatus[status] || 'Application update'} | ${applicationId}`,
    html: layout(titleByStatus[status] || 'Application status updated', name,
      `<p>${intro[status] || 'Your application status has been updated.'}</p>${pill('Application ID', applicationId)}${pill('Recruitment programme', title)}${details}<p>Always check your candidate dashboard for your latest status and available letters.</p>`),
    attachments: letterPdf ? [{ filename: `Interview-Call-Letter-${applicationId}.pdf`, content: letterPdf, contentType: 'application/pdf' }] : []
  });
}
async function sendJoiningEmail({ email, name, title, applicationId, joining, letterPdf }) {
  const { dateTime } = require('./letters');
  return sendMail({ to: email, subject: `Joining letter issued | ${applicationId} | ${title}`,
    html: layout('Joining letter and reporting instructions', name,
      `<p>Congratulations on your selection for <b>${escapeHtml(title)}</b>. Your <b>joining/reporting instructions</b> have been issued by the recruitment administration. This is not the training centre's confirmation of joining.</p>${pill('Application ID', applicationId)}${pill('Joining date and time', dateTime(joining.joiningAt))}${pill('Reporting venue', joining.venue)}${pill('Reporting officer', joining.reportingOfficer)}<p><b>Your joining/reporting instruction letter is attached as a PDF.</b> Print it and bring it along with the original documents specified in the letter. Please follow the reporting instructions carefully. After you actually join, the training centre will issue its separate confirmation letter; when recorded, your recruitment process will close.</p><p>If you need to review or download the letter again, sign in to your candidate dashboard.</p>`),
    attachments: letterPdf ? [{ filename: `Joining-Letter-${applicationId}.pdf`, content: letterPdf, contentType: 'application/pdf' }] : []
  });
}
async function sendCentreCompletionEmail({ email, name, title, applicationId, centreName, issuedAt, letterPdf }) {
  const { dateTime } = require('./letters');
  return sendMail({ to: email, subject: `Centre joining confirmation received | ${applicationId}`,
    html: layout('Recruitment process completed', name,
      `<p>The training centre has provided its <b>joining confirmation letter</b> for your records.</p>${pill('Application ID', applicationId)}${pill('Programme', title)}${pill('Issuing centre', centreName)}${pill('Centre letter date', dateTime(issuedAt))}<p>Your confirmation PDF is attached. <b>This marks the end of the online recruitment application process.</b> For classes, attendance, training arrangements, and any matters after joining, contact the training centre directly.</p><p>You may still sign in to download your historical recruitment letters; no additional action is required in this portal.</p>`),
    attachments: [{ filename: `Centre-Joining-Confirmation-${applicationId}.pdf`, content: letterPdf, contentType: 'application/pdf' }]
  });
}
module.exports = { sendOTP, sendApplicationReceived, sendStatusEmail, sendJoiningEmail, sendCentreCompletionEmail };
