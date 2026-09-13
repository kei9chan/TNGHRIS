import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../hooks/useAdditionalApprovals.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;

async function inbox({ role = 'BOD', stage = 'DIRECT_MANAGER', canAct = false, task = false, taskError = false, viewerActionStatus } = {}) {
  const states = [];
  const empty = { data: [], error: null };
  const query = { select() { return this; }, eq() { return this; }, in() { return this; }, order: async () => empty };
  const dependencies = {
    react: {
      useState(value) { const index = states.length; states.push(value); return [value, next => { states[index] = next; }]; },
      useCallback: fn => fn,
      useEffect() {},
    },
    '../services/supabaseClient': { supabase: { rpc: async () => empty, from: () => query } },
    '../services/offerApprovalService': { fetchPendingOfferApprovalIds: async () => [] },
    '../services/benefitApprovalService': { fetchMyPendingBenefitApprovals: async () => [] },
    '../services/assetApprovalService': { fetchMyAssetApprovalQueue: async () => [{
      requestId: 'asset-test', employeeId: 'employee-test', approvalStage: stage,
      isActionable: canAct, viewerActionStatus,
    }] },
    '../services/actionableApprovalService': { fetchActionableApprovalTasks: async () => {
      if (taskError) throw new Error('Task service unavailable');
      return task ? [{ request_type: 'asset', request_id: 'asset-test' }] : [];
    } },
  };
  const exports = {};
  vm.runInNewContext(output, { exports, require(name) {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  await exports.useAdditionalApprovals({ id: 'viewer-test', role }).refreshAdditionalApprovals();
  return { assets: states[5], error: states[7] };
}

assert.equal((await inbox()).assets.length, 0, 'BOD cannot act before manager approval');
assert.equal((await inbox({ role: 'Admin', task: true })).assets.length, 0, 'Admin role cannot turn a read-only request into an action');
assert.equal((await inbox({ role: 'Manager', canAct: true, task: true })).assets.length, 1, 'Assigned direct manager retains the request');
assert.equal((await inbox({ canAct: true, task: true })).assets.length, 1, 'BOD who is the assigned direct manager retains the request');
assert.equal((await inbox({ stage: 'BOD', canAct: true, task: true })).assets.length, 1, 'Request appears once the viewer can approve the BOD stage');
assert.equal((await inbox({ stage: 'BOD', viewerActionStatus: 'Approved' })).assets.length, 0, 'Already-approved request is not a pending action');
assert.equal((await inbox({ stage: 'BOD', canAct: true })).assets.length, 0, 'Both backend task and asset permission must allow action');
const failed = await inbox({ canAct: true, taskError: true });
assert.equal(failed.assets.length, 0);
assert.match(failed.error, /Task service unavailable/);
console.log('PASS: 8 asset inbox cases covering manager, BOD, Admin, stage advancement, prior approval and backend failure.');
