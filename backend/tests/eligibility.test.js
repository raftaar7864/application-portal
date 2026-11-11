const test = require('node:test');
const assert = require('node:assert/strict');
const { districtsList, homeDistrictAllowed } = require('../eligibility');
test('home-district restriction denies an unconfigured programme', () => {
  assert.equal(homeDistrictAllowed([], 'Nadia'), false);
  assert.equal(homeDistrictAllowed(undefined, 'Nadia'), false);
});
test('only configured permanent districts are eligible', () => {
  assert.equal(homeDistrictAllowed(['Nadia'], 'nadia'), true);
  assert.equal(homeDistrictAllowed(['Nadia'], '  NADIA  '), true);
  assert.equal(homeDistrictAllowed(['Nadia'], 'North 24 Parganas'), false);
});
test('normalizes duplicates and insignificant whitespace', () => {
  assert.deepEqual(districtsList(['Nadia', ' nadia ', 'North  24   Parganas']), ['nadia', 'North 24 Parganas']);
});
