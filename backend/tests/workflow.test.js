const test = require('node:test');
const assert = require('node:assert/strict');
const { isRecruitmentClosed, canRecordCentreConfirmation } = require('../workflow');
const reported = new Date('2026-11-09T05:30:00.000Z'); // 11 AM IST
const now = new Date('2026-11-10T08:00:00.000Z');
const example = { status: 'selected', joining: { issuedAt: new Date('2026-11-05T00:00:00Z'), joiningAt: reported } };
test('centre-issued letter closes recruitment only after reporting day', () => {
  assert.equal(canRecordCentreConfirmation(example, '2026-11-09', now), true);
  assert.equal(canRecordCentreConfirmation(example, '2026-11-10', now), true);
  assert.equal(canRecordCentreConfirmation(example, '2026-11-08', now), false);
});
test('record cannot close before physical joining date', () => {
  const upcoming = { ...example, joining: { ...example.joining, joiningAt: new Date('2026-11-11T05:30:00Z') } };
  assert.equal(canRecordCentreConfirmation(upcoming, '2026-11-10', now), false);
});
test('rejected, unselected, previously closed or missing reporting-letter records cannot close', () => {
  assert.equal(canRecordCentreConfirmation({ ...example, status: 'rejected' }, '2026-11-10', now), false);
  assert.equal(canRecordCentreConfirmation({ ...example, status: 'joined_closed' }, '2026-11-10', now), false);
  assert.equal(canRecordCentreConfirmation({ status: 'selected' }, '2026-11-10', now), false);
  assert.equal(isRecruitmentClosed('joined_closed'), true);
  assert.equal(isRecruitmentClosed('selected'), false);
});
