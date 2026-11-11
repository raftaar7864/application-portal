// Printable A4 documents. PDFs are generated only for authenticated owners/admins.
const PDFDocument = require('pdfkit');
const fs = require('node:fs');

const ORG = (process.env.RECRUITMENT_ORG_NAME || 'JIS Group - Narula Educational Trust').slice(0, 100);
const date = (value) => value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'long', year: 'numeric' }) : '—';
const dateTime = (value) => value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) + ' IST' : '—';
const val = (value) => String(value ?? '—').trim() || '—';
const labelType = t => t === 'gram_panchayat' ? 'Gram Panchayat' : t === 'municipality' ? 'Municipality' : 'Local body';

async function pdfBuffer(kind, a) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 44, bottom: 58, left: 52, right: 52 }, info: { Title: `${kind.toUpperCase()} - ${a.applicationId}`, Author: ORG } });
  // Optional Unicode font on the deployment host (e.g. a system Bengali-capable font).
  // Font files are not bundled. Set PDF_FONT_PATH if regional-script text is required.
  const customFont = process.env.PDF_FONT_PATH && fs.existsSync(process.env.PDF_FONT_PATH) ? process.env.PDF_FONT_PATH : null;
  if (customFont) doc.registerFont('CustomText', customFont);
  const regular = customFont ? 'CustomText' : 'Helvetica';
  const strong = customFont ? 'CustomText' : 'Helvetica-Bold';
  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));
  const completed = new Promise((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
  const W = 595.28;
  doc.rect(0, 0, W, 16).fill('#204a98');
  doc.fillColor('#1a2c58').font(strong).fontSize(16).text(ORG, 52, 37, { width: 490, align: 'center' });
  doc.font(regular).fontSize(9).fillColor('#67758b').text('OFFICIAL CANDIDATE COMMUNICATION', 52, 61, { width: 490, align: 'center', characterSpacing: 1 });
  doc.moveTo(52, 88).lineTo(543, 88).lineWidth(1).strokeColor('#dce4f1').stroke();
  const title = { acknowledgement: 'APPLICATION ACKNOWLEDGEMENT', interview: 'INTERVIEW CALL LETTER', joining: 'JOINING / REPORTING INSTRUCTIONS' }[kind];
  doc.font(strong).fontSize(15).fillColor('#153a77').text(title, 52, 105, { width: 491, align: 'center' });
  const tag = kind === 'acknowledgement' ? 'SUBMITTED' : kind === 'interview' ? 'INTERVIEW INVITATION' : 'REPORT FOR JOINING';
  doc.roundedRect(207, 134, 181, 24, 12).fill('#eff5ff');
  doc.font(strong).fontSize(8.5).fillColor('#24519d').text(tag, 207, 141, { width: 181, align: 'center' });
  let y = 178;
  const sep = () => { doc.moveTo(52, y).lineTo(543, y).strokeColor('#dfe6f1').lineWidth(.6).stroke(); y += 13; };
  const row = (left, right, rightLabel, rightValue) => {
    const height = Math.max(doc.heightOfString(val(right), { width: rightLabel ? 218 : 336, fontSize: 10 }), rightLabel ? doc.heightOfString(val(rightValue), { width: 210, fontSize: 10 }) : 0, 14);
    if (y + height + 28 > 732) { doc.addPage(); y = 58; }
    doc.font(regular).fontSize(8).fillColor('#697a98').text(left.toUpperCase(), 52, y, { width: rightLabel ? 218 : 130 });
    doc.font(strong).fontSize(10).fillColor('#203354').text(val(right), rightLabel ? 52 : 192, y + (rightLabel ? 14 : 0), { width: rightLabel ? 210 : 340 });
    if (rightLabel) {
      doc.font(regular).fontSize(8).fillColor('#697a98').text(rightLabel.toUpperCase(), 304, y, { width: 237 });
      doc.font(strong).fontSize(10).fillColor('#203354').text(val(rightValue), 304, y + 14, { width: 235 });
    }
    y += Math.max(height + (rightLabel ? 23 : 11), 37);
  };
  const section = (t) => { if (y > 685) { doc.addPage(); y = 55; } doc.fillColor('#153a77').font(strong).fontSize(10).text(t.toUpperCase(), 52, y); y += 18; sep(); };
  const paragraph = (s) => { doc.font(regular).fontSize(10).fillColor('#2e3d59'); const h=doc.heightOfString(val(s), { width: 487, lineGap: 3 }); if(y+h>744) { doc.addPage(); y=58; } doc.text(val(s), 52, y, { width:487, lineGap:3 }); y += h+14; };
  row('Application reference', a.applicationId, 'Issue date', date(new Date()));
  row('Programme', a.campaign.title, 'Programme code', a.campaign.code);
  section('Candidate details');
  row('Full name', a.fullName, 'Mobile / user ID', a.user.phone);
  row('Verified email', a.user.email, 'Home district', a.district);
  row('Block', a.blockName || 'Not applicable', labelType(a.localBodyType), a.localBodyName);
  row('Address', a.address);
  if (kind === 'acknowledgement') {
    section('Application receipt');
    row('Submission date', dateTime(a.createdAt), 'Application status', 'Received');
    paragraph('Your online application has been received. This acknowledgement confirms submission only; it does not confirm eligibility, shortlisting, or selection. Please retain your application ID and check your candidate dashboard for recruitment updates.');
    paragraph('At interview, candidates must present their interview call letter (when issued), original proof of identity, education/age documents and photocopies as instructed.');
  } else if (kind === 'interview') {
    section('Interview schedule');
    row('Interview date and time', dateTime(a.interview.scheduledAt));
    row('Reporting venue', a.interview.venue);
    paragraph('You are hereby invited to attend the interview for the programme shown above. Please arrive at least 30 minutes before the reporting time.');
    paragraph('IMPORTANT: You must carry a PRINTED copy of this interview call letter on interview day, along with original photo identity proof, educational and age certificates, relevant eligibility certificates, passport-sized photographs, and one set of self-attested photocopies.');
    if (a.interview.note) { section('Additional instructions'); paragraph(a.interview.note); }
    paragraph('This interview invitation is not an offer of employment or guarantee of final selection.');
  } else if (kind === 'joining') {
    section('Appointment and reporting');
    row('Letter reference', a.joining.referenceNumber);
    row('Joining / reporting date', dateTime(a.joining.joiningAt));
    row('Programme duration', a.campaign.duration || 'As notified by centre');
    row('Joining venue', a.joining.venue);
    row('Reporting officer', a.joining.reportingOfficer, 'Role / programme', a.joining.designation);
    paragraph(`Dear ${a.fullName},`);
    paragraph(`Following your selection for ${a.campaign.title}, you are requested to report at the above venue and date for joining formalities. Please follow the reporting instructions and complete verification as directed by the recruiting organization.`);
    if (a.joining.documents) { section('Documents to bring'); paragraph(a.joining.documents); }
    if (a.joining.instructions) { section('Joining instructions'); paragraph(a.joining.instructions); }
    paragraph('This is a reporting instruction letter, NOT confirmation that the candidate has joined the training centre. Once the candidate reports and joins, the training centre will issue its own joining confirmation letter. On recording that letter the online recruitment process ends; all subsequent training matters are managed directly by the centre.');
  }
  if (y > 688) { doc.addPage(); y=60; }
  y += 5;
  doc.moveTo(52, y).lineTo(543, y).strokeColor('#dfe6f1').stroke();
  doc.font(strong).fontSize(10).fillColor('#213a62').text('Recruitment Administration', 52, y + 17);
  doc.font(regular).fontSize(8).fillColor('#70809a').text('Computer-generated document. Verify the current status by logging in to the candidate portal.', 52, y+37, { width: 480 });
  doc.end();
  return completed;
}
module.exports = { pdfBuffer, dateTime };
