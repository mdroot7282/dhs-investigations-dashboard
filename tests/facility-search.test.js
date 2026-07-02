const test = require('node:test');
const assert = require('node:assert/strict');
const { filterFacilityMatches, normalizeSearchText } = require('../facilitySearch.js');

test('normalizes search text for case-insensitive matching', () => {
  assert.equal(normalizeSearchText('  CHICAGO  '), 'chicago');
});

test('filters facilities by partial title matches ignoring case', () => {
  const facilities = [
    { Title: 'Alton Mental Health Center' },
    { Title: 'Chicago-Read Mental Health Center' },
    { Title: 'Choate Mental Health and Developmental Center' }
  ];

  const matches = filterFacilityMatches(facilities, 'chi');

  assert.deepEqual(matches.map((facility) => facility.Title), [
    'Chicago-Read Mental Health Center'
  ]);
});

test('returns an empty list for empty queries', () => {
  const facilities = [{ Title: 'Alton Mental Health Center' }];
  assert.deepEqual(filterFacilityMatches(facilities, '   '), []);
});
