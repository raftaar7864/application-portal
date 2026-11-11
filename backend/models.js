const mongoose = require('mongoose');
const { Schema } = mongoose;

const UserSchema = new Schema({
  fullName: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  phone: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['candidate', 'admin'], default: 'candidate' },
  emailVerified: { type: Boolean, default: false },
  verification: {
    hash: { type: String, select: false },
    expiresAt: Date,
    attempts: { type: Number, default: 0 },
    lastSentAt: Date
  },
  passwordReset: {
    hash: { type: String, select: false },
    expiresAt: Date,
    attempts: { type: Number, default: 0 },
    lastSentAt: Date
  }
}, { timestamps: true });

const CampaignSchema = new Schema({
  title: { type: String, required: true, trim: true },
  code: { type: String, required: true, uppercase: true, trim: true, unique: true },
  department: { type: String, default: 'Hospitality & Skill Development' },
  location: { type: String, default: 'Kolkata, West Bengal' },
  description: { type: String, required: true },
  seats: { type: Number, min: 0, default: 0 },
  minAge: { type: Number, min: 0, default: 18 },
  maxAge: { type: Number, min: 0, default: 30 },
  qualification: { type: String, default: 'Class XII passed' },
  duration: { type: String, default: '4 months' },
  benefits: { type: [String], default: ['Free training', 'Hostel facilities', 'Meals', 'Placement assistance'] },
  opensAt: { type: String, default: '' }, // India-local YYYY-MM-DD
  closesAt: { type: String, default: '' }, // India-local YYYY-MM-DD, inclusive
  allowedDistricts: { type: [String], default: [] }, // permanent home district eligibility; empty = applications disabled
  stage: { type: String, enum: ['application', 'screening', 'interview', 'selection', 'completed'], default: 'application' },
  published: { type: Boolean, default: false },
  publishResults: { type: Boolean, default: false },
  memorandumTitle: { type: String, default: 'Recruitment Memorandum' },
  memorandumSummary: { type: String, default: '' },
  memorandumInstructions: { type: String, default: '' },
  internalMemo: { type: String, default: '' }
}, { timestamps: true });

const ApplicationSchema = new Schema({
  applicationId: { type: String, required: true, unique: true, index: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  campaign: { type: Schema.Types.ObjectId, ref: 'Campaign', required: true },
  fullName: { type: String, required: true },
  dob: { type: String, required: true },
  gender: { type: String, required: true, enum: ['Female', 'Male', 'Other', 'Prefer not to say'] },
  guardianName: { type: String, required: true },
  address: { type: String, required: true },
  district: { type: String, required: true }, // candidate's permanent / home district
  blockName: { type: String, default: '' },
  localBodyType: { type: String, enum: ['gram_panchayat', 'municipality'] },
  localBodyName: { type: String, default: '' },
  residenceDeclaration: { type: Boolean, default: false },
  pincode: { type: String, required: true },
  qualification: { type: String, required: true },
  category: { type: String, default: 'General' },
  experience: { type: String, default: '' },
  willingToRelocate: { type: Boolean, default: false },
  documentsReady: { type: [String], default: [] },
  consentToPublishName: { type: Boolean, default: false },
  declaration: { type: Boolean, required: true },
  status: { type: String, enum: ['submitted', 'shortlisted', 'interview_called', 'interviewed', 'selected', 'rejected', 'joined_closed'], default: 'submitted' },
  interview: { scheduledAt: Date, venue: String, note: String, letterIssuedAt: Date },
  joining: { issuedAt: Date, joiningAt: Date, venue: String, reportingOfficer: String, designation: String, documents: String, instructions: String, referenceNumber: String, emailSent: Boolean },
  centreConfirmation: { issuedAt: Date, centreName: String, uploadedAt: Date, emailSent: Boolean },
  adminNotes: { type: String, default: '' },
  statusChangedAt: Date
}, { timestamps: true });
ApplicationSchema.index({ user: 1, campaign: 1 }, { unique: true });

// The centre's original signed PDF is stored separately, never exposed in list responses.
const CentreLetterSchema = new Schema({
  application: { type: Schema.Types.ObjectId, ref: 'Application', required: true, unique: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  centreName: { type: String, required: true },
  issuedAt: { type: Date, required: true },
  filename: { type: String, default: 'Centre-Joining-Confirmation.pdf' },
  pdf: { type: Buffer, required: true, select: false }
}, { timestamps: true });

const NotificationSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  campaign: { type: Schema.Types.ObjectId, ref: 'Campaign' },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, enum: ['received', 'shortlisted', 'interview', 'result', 'joining', 'completed', 'general'], default: 'general' },
  emailSent: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = {
  User: mongoose.model('User', UserSchema),
  Campaign: mongoose.model('Campaign', CampaignSchema),
  Application: mongoose.model('Application', ApplicationSchema),
  Notification: mongoose.model('Notification', NotificationSchema),
  CentreLetter: mongoose.model('CentreLetter', CentreLetterSchema)
};
