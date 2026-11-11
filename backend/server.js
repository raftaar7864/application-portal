require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const { z, ZodError } = require('zod');
const { User, Campaign, Application, Notification, CentreLetter } = require('./models');
const { sendOTP, sendApplicationReceived, sendStatusEmail, sendJoiningEmail, sendCentreCompletionEmail } = require('./mail');
const { pdfBuffer } = require('./letters');
const { districtsList, homeDistrictAllowed } = require('./eligibility');
const { canRecordCentreConfirmation } = require('./workflow');

const app = express();
const PORT = Number(process.env.PORT || 5000);
const IST = 'Asia/Kolkata';
const emailSchema = z.string().trim().email().transform(v => v.toLowerCase());
const phoneSchema = z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number');
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const asString = (max = 300) => z.string().trim().min(1).max(max);
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (status, message) => Object.assign(new Error(message), { status });
const todayIST = () => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = key => parts.find(p => p.type === key).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};
const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const eligibleWindow = c => c.published && c.stage === 'application' && Array.isArray(c.allowedDistricts) && c.allowedDistricts.length > 0 && validDate(c.opensAt) && validDate(c.closesAt) && todayIST() >= c.opensAt && todayIST() <= c.closesAt;
const safeUser = u => ({ id: String(u._id), fullName: u.fullName, email: u.email, phone: u.phone, role: u.role, emailVerified: u.emailVerified });
const tokenFor = u => jwt.sign({ sub: String(u._id) }, process.env.JWT_SECRET, { expiresIn: '7d' });
const otpDigest = code => crypto.createHash('sha256').update(`${code}:${process.env.OTP_PEPPER || process.env.JWT_SECRET}`).digest('hex');
const newOtp = () => String(crypto.randomInt(100000, 1000000));
const maskName = n => String(n || '').trim().split(/\s+/).map(w => w[0] + '*'.repeat(Math.min(Math.max(w.length - 1, 1), 5))).join(' ');
const publicCampaign = c => {
  const { internalMemo, ...rest } = c.toObject ? c.toObject() : c;
  return { ...rest, acceptingApplications: eligibleWindow(c) };
};
const qualificationRank = value => {
  const s = String(value || '').toLowerCase();
  if (/postgraduat|master/.test(s)) return 18;
  if (/graduat|bachelor/.test(s)) return 16;
  if (/diploma|class\s*xii|class\s*12|\b12th\b|higher secondary/.test(s)) return 12;
  if (/class\s*x($|\s)|class\s*10|\b10th\b|secondary/.test(s)) return 10;
  return 0; // unknown qualifications require manual verification
};
const ageAt = (dob, at) => {
  const [y, m, d] = dob.split('-').map(Number);
  const [Y, M, D] = at.split('-').map(Number);
  return Y - y - (M < m || (M === m && D < d) ? 1 : 0);
};
const escapeRegex = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('Set JWT_SECRET to a unique secret of at least 32 characters in backend/.env');
  process.exit(1);
}
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map(s => s.trim()), credentials: false }));
app.use(express.json({ limit: '100kb' }));
app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use(morgan('dev'));
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });
app.use('/api/auth', authLimit);

async function requireAuth(req, _res, next) {
  try {
    const authorization = req.headers.authorization || '';
    if (!authorization.startsWith('Bearer ')) throw fail(401, 'Please log in');
    const payload = jwt.verify(authorization.slice(7), process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user) throw fail(401, 'Account no longer exists');
    req.user = user;
    next();
  } catch (err) { next(err.status ? err : fail(401, 'Session expired. Please log in again.')); }
}
const adminOnly = (req, _res, next) => req.user.role === 'admin' ? next() : next(fail(403, 'Admin access required'));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', todayIST: todayIST() }));

// Authentication: phone is the login ID; email is independently verified with an OTP.
app.post('/api/auth/register', wrap(async (req, res) => {
  const data = z.object({ fullName: asString(100), phone: phoneSchema, email: emailSchema, password: z.string().min(6).max(72) }).parse(req.body);
  if (await User.exists({ $or: [{ phone: data.phone }, { email: data.email }] })) throw fail(409, 'Phone or email already registered. Log in or verify your email.');
  const code = newOtp();
  const user = await User.create({ fullName: data.fullName, phone: data.phone, email: data.email, passwordHash: await bcrypt.hash(data.password, 12), verification: { hash: otpDigest(code), expiresAt: new Date(Date.now() + 10 * 60_000), attempts: 0, lastSentAt: new Date() } });
  let mailDelivered = false;
  try { mailDelivered = await sendOTP(user.email, user.fullName, code); }
  catch (err) { console.error('Verification mail failed:', err.message); return res.status(503).json({ message: 'Account created but verification email could not be delivered. Check SMTP settings and use Resend OTP.' }); }
  res.status(201).json({ message: mailDelivered ? 'Account created. Enter the verification code sent to your email.' : 'Account created. In development mode, check the backend terminal for your email OTP.', email: user.email });
}));

app.post('/api/auth/resend-otp', wrap(async (req, res) => {
  const { email } = z.object({ email: emailSchema }).parse(req.body);
  const user = await User.findOne({ email }).select('+verification.hash');
  if (!user) throw fail(404, 'No account found for that email');
  if (user.emailVerified) throw fail(400, 'This email is already verified. Please log in.');
  if (user.verification?.lastSentAt && Date.now() - new Date(user.verification.lastSentAt).getTime() < 60_000) throw fail(429, 'Please wait 60 seconds before requesting another OTP');
  const code = newOtp();
  user.verification = { hash: otpDigest(code), expiresAt: new Date(Date.now() + 600_000), attempts: 0, lastSentAt: new Date() };
  await user.save();
  await sendOTP(user.email, user.fullName, code);
  res.json({ message: 'A new OTP has been sent.' });
}));

app.post('/api/auth/verify-email', wrap(async (req, res) => {
  const { email, otp } = z.object({ email: emailSchema, otp: z.string().regex(/^\d{6}$/) }).parse(req.body);
  const user = await User.findOne({ email }).select('+verification.hash');
  if (!user) throw fail(404, 'Account not found');
  if (user.emailVerified) return res.json({ token: tokenFor(user), user: safeUser(user), message: 'Email already verified' });
  const v = user.verification;
  if (!v?.hash || !v.expiresAt || new Date(v.expiresAt) < new Date() || (v.attempts || 0) >= 5) throw fail(400, 'Code expired or attempt limit reached. Request a new OTP.');
  const actual = Buffer.from(otpDigest(otp), 'hex'), expected = Buffer.from(v.hash, 'hex');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    user.verification.attempts = (v.attempts || 0) + 1;
    await user.save();
    throw fail(400, 'Incorrect verification code');
  }
  user.emailVerified = true;
  user.verification = undefined;
  await user.save();
  res.json({ token: tokenFor(user), user: safeUser(user), message: 'Email verified successfully' });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const { phone, password } = z.object({ phone: phoneSchema, password: z.string().min(1) }).parse(req.body);
  const user = await User.findOne({ phone }).select('+passwordHash');
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw fail(401, 'Invalid phone number or password');
  if (!user.emailVerified) return res.status(403).json({ message: 'Please verify your email to continue.', code: 'EMAIL_UNVERIFIED', email: user.email });
  res.json({ token: tokenFor(user), user: safeUser(user) });
}));
app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: safeUser(req.user) }));

app.post('/api/auth/forgot-password', wrap(async (req, res) => {
  const { email } = z.object({ email: emailSchema }).parse(req.body);
  const user = await User.findOne({ email }).select('+passwordReset.hash');
  if (user) {
    if (!user.passwordReset?.lastSentAt || Date.now() - new Date(user.passwordReset.lastSentAt).getTime() >= 60_000) {
      const code = newOtp();
      user.passwordReset = { hash: otpDigest(code), expiresAt: new Date(Date.now() + 600_000), attempts: 0, lastSentAt: new Date() };
      await user.save();
      try { await sendOTP(user.email, user.fullName, code, 'reset'); } catch (err) { console.error('Password reset email failed:', err.message); }
    }
  }
  res.json({ message: 'If the account exists, a password reset OTP has been sent.' });
}));
app.post('/api/auth/reset-password', wrap(async (req, res) => {
  const { email, otp, newPassword } = z.object({ email: emailSchema, otp: z.string().regex(/^\d{6}$/), newPassword: z.string().min(6).max(72) }).parse(req.body);
  const user = await User.findOne({ email }).select('+passwordReset.hash +passwordHash');
  if (!user || !user.passwordReset?.hash || new Date(user.passwordReset.expiresAt) < new Date() || user.passwordReset.attempts >= 5) throw fail(400, 'Invalid or expired reset code');
  const actual = Buffer.from(otpDigest(otp), 'hex'), expected = Buffer.from(user.passwordReset.hash, 'hex');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    user.passwordReset.attempts = (user.passwordReset.attempts || 0) + 1;
    await user.save();
    throw fail(400, 'Invalid or expired reset code');
  }
  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.passwordReset = undefined;
  await user.save();
  res.json({ message: 'Password reset successfully. Please log in.' });
}));

// Public website: future and closed campaigns are visible; acceptingApplications is server-derived.
// Live sitemap source: reverse-proxy frontend /sitemap.xml to this endpoint if
// the hosting platform supports rewrites; otherwise use the generated static file.
app.get('/api/public/sitemap.xml', wrap(async (_req, res) => {
  const rawUrl = process.env.SEO_PUBLIC_SITE_URL || (process.env.CLIENT_URL || '').split(',')[0].trim();
  let site;
  try {
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        ['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Not a public URL');
    site = `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch { throw fail(503, 'Configure SEO_PUBLIC_SITE_URL to your public website HTTPS domain'); }
  const campaigns = await Campaign.find({ published: true }).select('_id updatedAt').sort({ updatedAt: -1 }).lean();
  const escapeXml = x => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const urls = ['/', '/opportunities', '/memorandum', '/results'].map(path => ({ path }));
  for (const c of campaigns) urls.push({ path: `/opportunities/${c._id}`, lastmod: c.updatedAt });
  const rows = urls.map(x => `<url><loc>${escapeXml(site + x.path)}</loc>${x.lastmod ? `<lastmod>${new Date(x.lastmod).toISOString().slice(0, 10)}</lastmod>` : ''}</url>`);
  res.set('Cache-Control', 'public, max-age=900');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rows.join('')}</urlset>`);
}));

app.get('/api/public/campaigns', wrap(async (_req, res) => {
  const items = await Campaign.find({ published: true }).sort({ createdAt: -1 }).lean();
  res.json({ campaigns: items.map(publicCampaign) });
}));
app.get('/api/public/campaigns/:id', wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw fail(404, 'Programme not found');
  const c = await Campaign.findOne({ _id: req.params.id, published: true }).lean();
  if (!c) throw fail(404, 'Programme not found');
  res.json({ campaign: publicCampaign(c) });
}));
app.get('/api/public/results', wrap(async (req, res) => {
  const campaigns = await Campaign.find({ published: true, publishResults: true }).select('_id title code').lean();
  const campaignIds = campaigns.map(c => c._id);
  const filter = { status: { $in: ['selected', 'joined_closed'] }, campaign: { $in: campaignIds } };
  if (req.query.campaignId) {
    if (!mongoose.isValidObjectId(req.query.campaignId)) throw fail(400, 'Invalid programme');
    filter.campaign = req.query.campaignId;
  }
  const apps = await Application.find(filter).select('applicationId fullName consentToPublishName campaign createdAt').sort({ applicationId: 1 }).limit(1000).lean();
  const names = new Map(campaigns.map(c => [String(c._id), c.title]));
  res.json({ campaigns, results: apps.filter(a => names.has(String(a.campaign))).map(a => ({ applicationId: a.applicationId, displayName: a.consentToPublishName ? a.fullName : maskName(a.fullName), campaignTitle: names.get(String(a.campaign)), campaignId: a.campaign })) });
}));

// Candidate section
const applicationSchema = z.object({
  campaignId: z.string(),
  dob: dateSchema, gender: z.enum(['Female', 'Male', 'Other', 'Prefer not to say']), guardianName: asString(100),
  address: asString(350), district: asString(100),
  blockName: z.string().trim().max(100).default(''),
  localBodyType: z.enum(['gram_panchayat', 'municipality']),
  localBodyName: asString(120),
  residenceDeclaration: z.literal(true),
  pincode: z.string().regex(/^\d{6}$/, 'Enter a valid six-digit PIN code'),
  qualification: asString(120), category: z.string().max(70).default('General'), experience: z.string().max(500).optional().default(''),
  willingToRelocate: z.boolean().default(false), documentsReady: z.array(z.string().max(60)).max(20).default([]),
  consentToPublishName: z.boolean().default(false), declaration: z.literal(true)
});
app.get('/api/applications/mine', requireAuth, wrap(async (req, res) => {
  const applications = await Application.find({ user: req.user._id }).populate('campaign', 'title code location stage opensAt closesAt publishResults allowedDistricts').sort({ createdAt: -1 }).lean();
  const notifications = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(15).lean();
  res.json({ applications, notifications });
}));
app.post('/api/applications', requireAuth, wrap(async (req, res) => {
  if (req.user.role !== 'candidate') throw fail(403, 'Only candidates can apply');
  if (!req.user.emailVerified) throw fail(403, 'Email verification is required');
  const data = applicationSchema.parse(req.body);
  if (!mongoose.isValidObjectId(data.campaignId)) throw fail(400, 'Invalid programme');
  const campaign = await Campaign.findById(data.campaignId);
  if (!campaign) throw fail(404, 'Programme not found');
  if (!eligibleWindow(campaign)) throw fail(403, 'Applications are closed, or the administrator has not configured eligible home districts for this programme');
  if (!homeDistrictAllowed(campaign.allowedDistricts, data.district)) throw fail(403, `Only permanent residents of ${campaign.allowedDistricts.join(', ')} may apply for this programme`);
  if (data.localBodyType === 'gram_panchayat' && !data.blockName) throw fail(400, 'Block name is required for Gram Panchayat applicants');
  if (!validDate(data.dob) || data.dob > todayIST()) throw fail(400, 'Enter a valid date of birth');
  const age = ageAt(data.dob, campaign.closesAt);
  if (age < campaign.minAge || age > campaign.maxAge) throw fail(400, `Age must be ${campaign.minAge}–${campaign.maxAge} on the closing date`);
  const requiredRank = qualificationRank(campaign.qualification);
  const providedRank = qualificationRank(data.qualification);
  if (requiredRank && providedRank && providedRank < requiredRank) throw fail(400, `Minimum qualification for this programme: ${campaign.qualification}`);
  if (await Application.exists({ user: req.user._id, campaign: campaign._id })) throw fail(409, 'You have already applied to this programme');
  const applicationId = `APP-${new Date().getFullYear()}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
  const { campaignId, ...fields } = data;
  const application = await Application.create({ ...fields, applicationId, fullName: req.user.fullName, user: req.user._id, campaign: campaign._id });
  let emailSent = false;
  try { const pdf = await pdfBuffer('acknowledgement', { ...application.toObject(), user: req.user, campaign });
    emailSent = await sendApplicationReceived({ email: req.user.email, name: req.user.fullName, campaignTitle: campaign.title, applicationId, submittedAt: application.createdAt, pdf });
  } catch (err) { console.error('Application saved; acknowledgement email failed:', err.message); }
  await Notification.create({ user: req.user._id, campaign: campaign._id, title: 'Application received', message: `Application ${applicationId} received.${emailSent ? ' Acknowledgement PDF emailed.' : ' Download your acknowledgement PDF from the dashboard.'}`, type: 'received', emailSent });
  res.status(201).json({ message: emailSent ? 'Application submitted. Acknowledgement PDF sent to your email.' : 'Application submitted. Download the acknowledgement PDF from your dashboard.', applicationId: application.applicationId, emailSent, application });
}));

// Admin: programme configuration, different phases, interview management and results.
app.get('/api/admin/summary', requireAuth, adminOnly, wrap(async (_req, res) => {
  const [campaigns, grouped, joined] = await Promise.all([
    Campaign.find().sort({ createdAt: -1 }).lean(),
    Application.aggregate([{ $group: { _id: { campaign: '$campaign', status: '$status' }, count: { $sum: 1 } } }]),
    Application.aggregate([{ $match: { status: { $in: ['selected', 'joined_closed'] }, 'joining.issuedAt': { $exists: true } } }, { $group: { _id: '$campaign', count: { $sum: 1 } } }])
  ]);
  const stats = campaigns.map(c => {
    const counts = { submitted: 0, shortlisted: 0, interview_called: 0, interviewed: 0, selected: 0, rejected: 0, joined_closed: 0 };
    for (const row of grouped) if (String(row._id.campaign) === String(c._id)) counts[row._id.status] = row.count;
    const joiningIssued = joined.find(x => String(x._id) === String(c._id))?.count || 0;
    return { ...c, counts: { ...counts, joiningIssued, centreConfirmed: counts.joined_closed, successful: counts.selected + counts.joined_closed }, total: Object.values(counts).reduce((a, b) => a + b, 0), acceptingApplications: eligibleWindow(c) };
  });
  const overall = { total: 0, interview: 0, selected: 0, joiningIssued: 0, centreConfirmed: 0, campaigns: campaigns.length };
  for (const c of stats) { overall.total += c.total; overall.interview += c.counts.interview_called + c.counts.interviewed; overall.selected += c.counts.successful; overall.joiningIssued += c.counts.joiningIssued; overall.centreConfirmed += c.counts.centreConfirmed; }
  res.json({ overall, campaigns: stats });
}));

const campaignSchema = z.object({
  title: asString(160), code: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9-]+$/).transform(v => v.toUpperCase()),
  department: asString(130), location: asString(130), description: asString(4000),
  seats: z.number().int().min(0).max(100000), minAge: z.number().int().min(0).max(100), maxAge: z.number().int().min(0).max(100),
  qualification: asString(120), duration: asString(50), benefits: z.array(z.string().min(1).max(100)).max(12),
  opensAt: z.string().default(''), closesAt: z.string().default(''),
  allowedDistricts: z.array(asString(100)).max(50).default([]),
  stage: z.enum(['application', 'screening', 'interview', 'selection', 'completed']),
  published: z.boolean(), publishResults: z.boolean(),
  memorandumTitle: z.string().max(180).default(''), memorandumSummary: z.string().max(7000).default(''),
  memorandumInstructions: z.string().max(7000).default(''), internalMemo: z.string().max(10000).default('')
});
const validateCampaign = data => {
  if (data.maxAge < data.minAge) throw fail(400, 'Maximum age must be at least minimum age');
  if (data.opensAt && !validDate(data.opensAt) || data.closesAt && !validDate(data.closesAt)) throw fail(400, 'Enter valid application dates');
  if (data.opensAt && data.closesAt && data.closesAt < data.opensAt) throw fail(400, 'Closing date must be on or after opening date');
  if (data.published && (!data.opensAt || !data.closesAt)) throw fail(400, 'Set opening and closing dates before publishing');
  if (data.published && (!Array.isArray(data.allowedDistricts) || !data.allowedDistricts.length)) throw fail(400, 'Specify at least one eligible home district before publishing');
  if (data.publishResults && !['selection', 'completed'].includes(data.stage)) throw fail(400, 'Move to Selection or Completed phase before publishing results');
};
app.get('/api/admin/campaigns', requireAuth, adminOnly, wrap(async (_req, res) => res.json({ campaigns: await Campaign.find().sort({ createdAt: -1 }).lean() })));
app.post('/api/admin/campaigns', requireAuth, adminOnly, wrap(async (req, res) => {
  const data = campaignSchema.parse(req.body); data.allowedDistricts = districtsList(data.allowedDistricts); validateCampaign(data);
  const campaign = await Campaign.create(data); res.status(201).json({ campaign, message: 'Programme created' });
}));
app.patch('/api/admin/campaigns/:id', requireAuth, adminOnly, wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw fail(404, 'Programme not found');
  const campaign = await Campaign.findById(req.params.id);
  if (!campaign) throw fail(404, 'Programme not found');
  const data = campaignSchema.partial().parse(req.body);
  if (data.allowedDistricts) data.allowedDistricts = districtsList(data.allowedDistricts);
  const merged = { ...campaign.toObject(), ...data }; validateCampaign(merged);
  if (data.code && data.code !== campaign.code) throw fail(400, 'Programme code cannot be changed after creation');
  Object.assign(campaign, data);
  await campaign.save();
  res.json({ campaign, message: 'Programme updated' });
}));

app.get('/api/admin/applications', requireAuth, adminOnly, wrap(async (req, res) => {
  const filter = {};
  if (req.query.campaignId) { if (!mongoose.isValidObjectId(req.query.campaignId)) throw fail(400, 'Invalid programme'); filter.campaign = req.query.campaignId; }
  if (req.query.status === 'successful') filter.status = { $in: ['selected', 'joined_closed'] };
  else if (req.query.status && req.query.status !== 'all') {
    const permitted = ['submitted','shortlisted','interview_called','interviewed','selected','rejected','joined_closed'];
    if (!permitted.includes(req.query.status)) throw fail(400, 'Invalid candidate status');
    filter.status = req.query.status;
  }
  if (req.query.search) {
    const q = escapeRegex(String(req.query.search).slice(0, 100));
    const re = new RegExp(q, 'i');
    const users = await User.find({ $or: [{ phone: re }, { email: re }] }).select('_id').limit(500).lean();
    filter.$or = [{ applicationId: re }, { fullName: re }, { user: { $in: users.map(u => u._id) } }];
  }
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
  const [applications, total] = await Promise.all([
    Application.find(filter).populate('user', 'fullName email phone').populate('campaign', 'title code stage').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Application.countDocuments(filter)
  ]);
  res.json({ applications, total, page, pages: Math.ceil(total / limit) });
}));

app.get('/api/admin/applications/export.csv', requireAuth, adminOnly, wrap(async (req, res) => {
  const filter = {};
  if (req.query.campaignId) { if (!mongoose.isValidObjectId(req.query.campaignId)) throw fail(400, 'Invalid programme'); filter.campaign = req.query.campaignId; }
  const records = await Application.find(filter).populate('user', 'phone email').populate('campaign', 'title').sort({ createdAt: -1 }).limit(10000).lean();
  const fields = ['Application ID', 'Programme', 'Full Name', 'Phone', 'Email', 'Date of Birth', 'Home District', 'Block', 'Local Body Type', 'Gram Panchayat / Municipality', 'Qualification', 'Status', 'Applied On', 'Interview Date', 'Interview Venue', 'Joining Date', 'Joining Venue', 'Centre confirmation issued', 'Centre name', 'Application closed'];
  const csvCell = v => `"${String(v ?? '').replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""')}"`;
  const rows = records.map(a => [a.applicationId, a.campaign?.title, a.fullName, a.user?.phone, a.user?.email, a.dob, a.district, a.blockName, a.localBodyType, a.localBodyName, a.qualification, a.status, a.createdAt?.toISOString(), a.interview?.scheduledAt?.toISOString(), a.interview?.venue, a.joining?.joiningAt?.toISOString(), a.joining?.venue, a.centreConfirmation?.issuedAt?.toISOString(), a.centreConfirmation?.centreName, a.status === 'joined_closed' ? 'Yes' : 'No']);
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="recruitment-applications.csv"');
  res.send('\uFEFF' + [fields, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n'));
}));

app.patch('/api/admin/applications/:id/status', requireAuth, adminOnly, wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw fail(404, 'Application not found');
  const data = z.object({
    status: z.enum(['submitted', 'shortlisted', 'interview_called', 'interviewed', 'selected', 'rejected']),
    scheduledAt: z.string().optional(), venue: z.string().trim().max(300).optional(), note: z.string().trim().max(1000).optional(),
    adminNotes: z.string().max(2000).optional()
  }).parse(req.body);
  const application = await Application.findById(req.params.id).populate('user', 'email fullName phone').populate('campaign', 'title code stage duration');
  if (!application) throw fail(404, 'Application not found');
  if (application.status === 'joined_closed') throw fail(409, 'This recruitment record is closed after centre confirmation and cannot be changed');
  if (data.status === 'interview_called') {
    if (!['interview', 'selection', 'completed'].includes(application.campaign.stage)) throw fail(400, 'Move the programme to Interview phase first');
    if (!data.scheduledAt || !data.venue) throw fail(400, 'Interview date/time and venue are required');
    const at = new Date(data.scheduledAt);
    if (Number.isNaN(at.getTime()) || at < new Date()) throw fail(400, 'Choose a future interview date and time');
    application.interview = { scheduledAt: at, venue: data.venue, note: data.note || '', letterIssuedAt: new Date() };
  }
  if (data.status === 'selected' && !['selection', 'completed'].includes(application.campaign.stage)) throw fail(400, 'Move the programme to Selection phase first');
  // A reversed selection must not leave an active joining letter on the candidate dashboard.
  if (application.status === 'selected' && data.status !== 'selected') application.joining = undefined;
  const statusChanged = application.status !== data.status;
  application.status = data.status;
  application.statusChangedAt = new Date();
  if (data.adminNotes !== undefined) application.adminNotes = data.adminNotes;
  await application.save();
  const notify = data.status !== 'submitted' && (statusChanged || data.status === 'interview_called');
  let emailSent = false;
  if (notify) {
    try {
      const letterPdf = data.status === 'interview_called' ? await pdfBuffer('interview', application) : undefined;
      emailSent = await sendStatusEmail({ email: application.user.email, name: application.fullName, title: application.campaign.title, applicationId: application.applicationId, status: data.status, interview: application.interview, letterPdf });
    }
    catch (err) { console.error('Status updated; email failed:', err.message); }
    const content = data.status === 'interview_called' ? `Interview invitation for ${application.applicationId}. DOWNLOAD AND BRING your interview call letter to the venue.` : data.status === 'selected' ? `Congratulations! You have been selected for ${application.campaign.title}. Check your dashboard. Joining instructions will be sent separately.` : `Application ${application.applicationId} status changed to ${data.status.replaceAll('_', ' ')}.`;
    await Notification.create({ user: application.user._id, campaign: application.campaign._id, title: data.status === 'interview_called' ? 'Interview call' : 'Recruitment status update', message: content, type: data.status === 'interview_called' ? 'interview' : data.status === 'selected' ? 'result' : 'shortlisted', emailSent });
  }
  res.json({ application, emailSent, message: emailSent ? 'Status updated and candidate email sent.' : 'Status updated. Candidate can view it on the dashboard; email not sent.' });
}));


// Centre confirmation PDFs are private: only the candidate or administrator can retrieve them.
app.get('/api/applications/:id/centre-confirmation.pdf', requireAuth, wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw fail(404, 'Application not found');
  const a = await Application.findById(req.params.id);
  if (!a) throw fail(404, 'Application not found');
  if (req.user.role !== 'admin' && String(a.user) !== String(req.user._id)) throw fail(403, 'This letter belongs to another applicant');
  if (a.status !== 'joined_closed') throw fail(404, 'Centre joining confirmation has not been recorded');
  const record = await CentreLetter.findOne({ application: a._id }).select('+pdf');
  if (!record) throw fail(404, 'Centre letter PDF not found');
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `attachment; filename="${record.filename}"`);
  res.set('X-Content-Type-Options', 'nosniff');
  res.send(record.pdf);
}));

// Secure, on-demand A4 PDF letters. Candidates may access only their own records;
// administrators may access any record. No public PDF URL exposes personal data.
app.get('/api/applications/:id/:kind.pdf', requireAuth, wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw fail(404, 'Application not found');
  if (!['acknowledgement', 'interview-letter', 'joining-letter'].includes(req.params.kind)) throw fail(404, 'Unknown letter type');
  const a = await Application.findById(req.params.id).populate('user', 'email phone fullName').populate('campaign', 'title code duration');
  if (!a) throw fail(404, 'Application not found');
  if (req.user.role !== 'admin' && String(a.user?._id) !== String(req.user._id)) throw fail(403, 'This document belongs to another applicant');
  const kind = ({ acknowledgement: 'acknowledgement', 'interview-letter': 'interview', 'joining-letter': 'joining' })[req.params.kind];
  if (kind === 'interview' && !a.interview?.scheduledAt) throw fail(404, 'Interview call letter has not been issued');
  if (kind === 'joining' && (!['selected', 'joined_closed'].includes(a.status) || !a.joining?.issuedAt)) throw fail(404, 'Joining letter has not been issued');
  const pdf = await pdfBuffer(kind, a);
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `attachment; filename="${kind}-${a.applicationId}.pdf"`);
  res.set('X-Content-Type-Options', 'nosniff');
  res.send(pdf);
}));

// Joining letter issuance is a separate, explicit action after selection.
app.post('/api/admin/applications/:id/joining-letter', requireAuth, adminOnly, wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw fail(404, 'Application not found');
  const schema = z.object({
    joiningAt: z.string(), venue: asString(300), reportingOfficer: asString(120),
    designation: asString(120), documents: asString(1500), instructions: z.string().trim().max(1500).default('')
  });
  const data = schema.parse(req.body);
  const at = new Date(data.joiningAt);
  if (Number.isNaN(at.getTime()) || at.getTime() < Date.now() - 5 * 60_000) throw fail(400, 'Choose a future joining date and time');
  const a = await Application.findById(req.params.id).populate('user', 'email phone fullName').populate('campaign', 'title code stage duration');
  if (!a) throw fail(404, 'Application not found');
  if (a.status === 'joined_closed') throw fail(409, 'Centre confirmation has closed this recruitment application');
  if (a.status !== 'selected') throw fail(400, 'Only selected candidates can receive a joining letter');
  if (!['selection', 'completed'].includes(a.campaign.stage)) throw fail(400, 'Programme must be in Selection or Completed phase');
  const referenceNumber = a.joining?.referenceNumber || `JOIN-${a.applicationId}`;
  a.joining = { ...data, joiningAt: at, issuedAt: new Date(), referenceNumber, emailSent: false };
  await a.save();
  let emailSent = false;
  try {
    const pdf = await pdfBuffer('joining', a);
    emailSent = await sendJoiningEmail({ email: a.user.email, name: a.fullName, title: a.campaign.title, applicationId: a.applicationId, joining: a.joining, letterPdf: pdf });
  } catch (err) { console.error('Joining letter issued; email failed:', err.message); }
  a.joining.emailSent = emailSent;
  await a.save();
  await Notification.create({ user: a.user._id, campaign: a.campaign._id, title: 'Joining letter issued',
    message: `Your joining letter for ${a.campaign.title} is ready. Report on the scheduled date and bring the printed letter and required documents.`, type: 'joining', emailSent });
  res.json({ application: a, emailSent, message: emailSent ? 'Joining letter PDF emailed to the selected candidate.' : 'Joining letter issued and available on the dashboard. Email delivery was unsuccessful.' });
}));

// After physical joining, the TRAINING CENTRE issues its own signed confirmation letter.
// Administrator uploads that original PDF and the candidate's recruitment record is closed.
// It is intentionally not generated by the recruiting portal on the centre's behalf.
app.post('/api/admin/applications/:id/centre-letter', requireAuth, adminOnly,
  express.raw({ type: 'application/pdf', limit: '6mb' }), wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw fail(404, 'Application not found');
  const { centreName, issuedDate } = z.object({
    centreName: asString(150), issuedDate: dateSchema
  }).parse(req.query);
  if (!validDate(issuedDate) || issuedDate > todayIST()) throw fail(400, 'Select a valid centre-letter issue date (today or earlier)');
  const pdf = req.body;
  if (!Buffer.isBuffer(pdf) || pdf.length < 20 || pdf.length > 5 * 1024 * 1024 || pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw fail(400, 'Upload a valid PDF issued by the training centre (maximum 5 MB)');
  }
  const a = await Application.findById(req.params.id).populate('user', 'email fullName').populate('campaign', 'title code stage duration');
  if (!a) throw fail(404, 'Application not found');
  if (a.status === 'joined_closed') throw fail(409, 'Application already closed; centre letter cannot be replaced through recruitment workflow');
  if (!canRecordCentreConfirmation(a, issuedDate)) throw fail(400, 'Record centre confirmation only after the selected candidate has reached their joining date and the reporting letter was issued. Centre-letter date cannot precede joining day.');
  const issuedAt = new Date(`${issuedDate}T12:00:00+05:30`);
  await CentreLetter.create({ application: a._id, uploadedBy: req.user._id, centreName, issuedAt, pdf,
    filename: `Centre-Joining-Confirmation-${a.applicationId}.pdf` });
  a.centreConfirmation = { issuedAt, centreName, uploadedAt: new Date(), emailSent: false };
  a.status = 'joined_closed';
  a.statusChangedAt = new Date();
  await a.save();
  let emailSent = false;
  try { emailSent = await sendCentreCompletionEmail({ email: a.user.email, name: a.fullName, title: a.campaign.title,
    applicationId: a.applicationId, centreName, issuedAt, letterPdf: pdf }); }
  catch (err) { console.error('Centre confirmation recorded; email failed:', err.message); }
  a.centreConfirmation.emailSent = emailSent;
  await a.save();
  await Notification.create({ user: a.user._id, campaign: a.campaign._id, type: 'completed', emailSent,
    title: 'Centre joining confirmation received — recruitment closed',
    message: `Your centre-issued joining confirmation from ${centreName} is available as PDF. The recruitment application process is now complete; further training matters are handled directly by the centre.` });
  res.json({ application: a, emailSent,
    message: emailSent ? 'Centre confirmation saved, emailed and recruitment application closed.' : 'Centre confirmation saved; recruitment application closed. Email not sent, but PDF is downloadable.' });
}));

app.use((req, _res, next) => next(fail(404, `No endpoint: ${req.method} ${req.path}`)));
app.use((err, _req, res, _next) => {
  if (err instanceof ZodError) return res.status(400).json({ message: err.issues[0]?.message || 'Invalid fields', details: err.issues });
  if (err.code === 11000) return res.status(409).json({ message: 'This record already exists (duplicate phone, email, programme code or application).' });
  if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid identifier' });
  console.error('API error:', err.message);
  res.status(err.status || 500).json({ message: err.status ? err.message : 'Internal server error' });
});

async function start() {
  if (!process.env.MONGO_URI) throw new Error('Set MONGO_URI in backend/.env first');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 12000 });
  app.listen(PORT, () => console.log(`Recruitment API listening on http://localhost:${PORT} | IST date ${todayIST()}`));
}
if (require.main === module) start().catch(err => { console.error('Startup failed:', err.message); process.exit(1); });
module.exports = { app, eligibleWindow, todayIST };
