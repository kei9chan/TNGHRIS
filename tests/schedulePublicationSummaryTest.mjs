import assert from 'node:assert/strict';
import {schedulePublicationSummary as status} from '../services/schedulePublicationSummary.ts';

const live={published:true,pending:false,activeVersion:1};
const draft={published:false,pending:false,activeVersion:null};
const changed={published:false,pending:false,activeVersion:1};
const pending={published:false,pending:true,activeVersion:null};
assert.equal(status([live,live],2).kind,'live');
assert.equal(status([live,draft],2).kind,'partial');
assert.equal(status([pending,draft],2).kind,'pending');
assert.equal(status([changed,draft],2).kind,'changes');
assert.equal(status([draft,draft],2).kind,'draft');
assert.equal(status([live],2).kind,'unknown');
assert.equal(status([],0).kind,'empty');
console.log('PASS: full publication requires every displayed employee; partial, pending, changed, draft and incomplete states stay distinct.');
