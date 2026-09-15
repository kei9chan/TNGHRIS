import assert from 'node:assert/strict';
import { hrReviewCount } from '../services/hrReviewCount.ts';
assert.equal(hrReviewCount([], [], []), 0);
assert.equal(hrReviewCount([{id:1}], [{id:2}], ['a','a','b']), 4);
assert.equal(hrReviewCount([], [{id:2}], ['a','a','b']), 3); // registration reviewed
assert.equal(hrReviewCount([], [], ['b']), 1); // document and submission reviewed
assert.equal(hrReviewCount([], [], [], true), null); // never claim all clear before loading
assert.equal(hrReviewCount([], [], [], false, true), null); // failure is not zero
assert.equal(hrReviewCount([], [], []), 0); // fresh successful empty response
console.log('PASS: counts, grouped submissions, decision updates, empty refresh, loading and failure.');
