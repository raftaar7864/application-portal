// A recruitment record closes only AFTER the selected candidate has physically
// reached their reporting date and received the centre's own letter.
const isRecruitmentClosed = status => status === 'joined_closed';
const canRecordCentreConfirmation = (application, issuedDate, now = new Date()) => {
  if (!application || application.status !== 'selected' || !application.joining?.issuedAt || !application.joining?.joiningAt) return false;
  const joinTime = new Date(application.joining.joiningAt);
  if (Number.isNaN(joinTime.getTime()) || joinTime > now) return false;
  const dayAtCentre = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(joinTime);
  return /^\d{4}-\d{2}-\d{2}$/.test(issuedDate) && issuedDate >= dayAtCentre;
};
module.exports = { isRecruitmentClosed, canRecordCentreConfirmation };
