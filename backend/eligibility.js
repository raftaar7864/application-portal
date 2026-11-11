// Pure district helpers, isolated for testing. Never trust browser-only eligibility checks.
const normalizedDistrict = value => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-IN');
const districtsList = items => [...new Map((items || []).map(v => [normalizedDistrict(v), String(v || '').trim().replace(/\s+/g, ' ')]).filter(x => x[0])).values()];
const homeDistrictAllowed = (allowed, candidate) => Array.isArray(allowed) && allowed.length > 0 && allowed.some(d => normalizedDistrict(d) === normalizedDistrict(candidate));
module.exports = { normalizedDistrict, districtsList, homeDistrictAllowed };
