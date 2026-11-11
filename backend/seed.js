require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User, Campaign } = require('./models');

async function run() {
  if (!process.env.MONGO_URI) throw new Error('Set MONGO_URI in backend/.env');
  await mongoose.connect(process.env.MONGO_URI);
  const { ADMIN_NAME, ADMIN_PHONE, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (ADMIN_PHONE && ADMIN_EMAIL && ADMIN_PASSWORD) {
    if (!/^[6-9]\d{9}$/.test(ADMIN_PHONE) || ADMIN_PASSWORD.length < 6) throw new Error('Invalid ADMIN_PHONE or ADMIN_PASSWORD');
    const email = ADMIN_EMAIL.trim().toLowerCase();
    const found = await User.findOne({ $or: [{ phone: ADMIN_PHONE }, { email }] });
    if (!found) {
      await User.create({ fullName: ADMIN_NAME || 'Administrator', phone: ADMIN_PHONE, email, passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12), emailVerified: true, role: 'admin' });
      console.log('Admin account created. Login using ADMIN_PHONE and ADMIN_PASSWORD.');
    } else {
      console.log('Admin account already exists; credentials were not overwritten.');
    }
  } else {
    console.log('Admin seed skipped. Set ADMIN_PHONE, ADMIN_EMAIL and ADMIN_PASSWORD in backend/.env and rerun.');
  }
  if (!await Campaign.exists({ code: 'DDUGKY-GSA' })) {
    await Campaign.create({
      title: 'Deen Dayal Upadhyaya Grameen Kaushalya Yojana (DDU-GKY)',
      code: 'DDUGKY-GSA', department: 'Skill Development & Placement',
      location: 'Narula Educational Trust, 56 Jessore Road, Patipukur, Kolkata - 700048',
      description: 'Deen Dayal Upadhyaya Grameen Kaushalya Yojana (DDU-GKY) skill development programme with free training, hostel, food, courseware, uniforms and placement assistance through the Narula Educational Trust training centre.',
      minAge: 18, maxAge: 30, qualification: 'Class XII passed', duration: '4 months',
      benefits: ['100% free skill development training.', 'Free hostel accommodation.', 'Free food facilities.', 'Free courseware & uniforms.', '100% placement assistance.', 'Training duration: 4 months.'],
      memorandumTitle: 'Admission & Recruitment Memorandum',
      memorandumSummary: 'This memorandum describes the admission process for the Deen Dayal Upadhyaya Grameen Kaushalya Yojana (DDU-GKY) programme conducted through Narula Educational Trust, 56 Jessore Road, Patipukur, Kolkata - 700048. Registration is subject to the published application dates and eligibility verification.',
      memorandumInstructions: 'Keep Aadhaar, age proof/birth certificate, passport-size photo, educational certificate, bank passbook and applicable eligibility documents ready for the verification stage.',
      published: false, opensAt: '', closesAt: ''
    });
    console.log('A DRAFT sample campaign was created. Set opening/closing dates and publish it from the admin panel.');
  } else console.log('Sample campaign already exists; not changed.');
  await mongoose.disconnect();
}
run().catch((err) => { console.error(err); process.exitCode = 1; mongoose.disconnect(); });
