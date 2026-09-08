import assert from 'node:assert/strict';
import { build } from 'esbuild';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const empty = {
  pendingLeaveApprovals: [], pendingWfhApprovals: [], pendingOtApprovals: [], pendingManpowerApprovals: [],
  pendingNTEApprovals: [], pendingPANApprovals: [], pendingAwardApprovals: [], pendingOfferApprovals: [],
  pendingAssetApprovals: [], pendingRequisitionApprovals: [], pendingBenefitApprovals: [],
};
globalThis.approvalTest = { ...empty, user: { id: 'test-approver', role: 'HR Manager', roles: [] } };
const root = fileURLToPath(new URL('../', import.meta.url));
const result = await build({
  stdin: { contents: `export {default as Widget} from './components/dashboard/ApprovalWidget'; export {default as Links} from './components/dashboard/QuickLinks';`, resolveDir: root, loader: 'tsx' },
  bundle: true, platform: 'node', format: 'cjs', write: false, packages: 'external',
  plugins: [{ name: 'mock-authenticated-queues', setup(builder) {
    builder.onResolve({ filter: /^react$/ }, () => ({ path: 'react', external: true }));
    builder.onResolve({ filter: /useAuth$|useApprovals$|useAdditionalApprovals$|usePermissions$|react-router-dom$/ }, args => ({ path: args.path, namespace: 'mock' }));
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents:
      args.path === 'react-router-dom' ? `const React=require('react'); exports.Link=({to,state,...props})=>React.createElement('a',{...props,href:to});` :
      args.path.endsWith('useAuth') ? `exports.useAuth=()=>({user:globalThis.approvalTest.user});` :
      args.path.endsWith('usePermissions') ? `exports.usePermissions=()=>({can:()=>false,workflowCan:()=>false,getIrAccess:()=>({canCreate:false})});` :
      `exports.${args.path.endsWith('useAdditionalApprovals') ? 'useAdditionalApprovals' : 'useApprovals'}=()=>globalThis.approvalTest;`, loader: 'js' }));
  }}],
});
const compiled = new Module(`${root}approval-render-test.cjs`);
compiled.filename = `${root}approval-render-test.cjs`;
compiled.paths = Module._nodeModulePaths(root);
compiled.require = createRequire(compiled.filename);
compiled._compile(result.outputFiles[0].text, compiled.filename);
const { Widget, Links } = compiled.exports;
globalThis.approvalTest.pendingBenefitApprovals = [{ id: 'test-benefit', submissionDate: new Date() }];
let html = renderToStaticMarkup(React.createElement(Widget));
assert.match(html, /Benefits/);
assert.match(html, /1 pending/);
assert.match(html, /href="\/approvals\?type=benefit"/);
globalThis.approvalTest.pendingBenefitApprovals = [];
assert.equal(renderToStaticMarkup(React.createElement(Widget)), '');
assert.match(renderToStaticMarkup(React.createElement(Links)), /href="\/approvals"/);
globalThis.approvalTest.additionalApprovalError = 'Queue unavailable';
assert.match(renderToStaticMarkup(React.createElement(Widget)), /Approval workload could not be loaded/);
globalThis.approvalTest.user = null;
assert.equal(renderToStaticMarkup(React.createElement(Links)), '');
delete globalThis.approvalTest;
console.log('Dashboard render tests passed: benefit-only queue, empty queue, persistent link, error, signed-out.');
