import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
const noop = () => {};
let state = [], cursor = 0, calls = [], release;
const hooks = { ...React, useEffect: noop, useLayoutEffect: noop, useMemo: fn => fn(), useRef: value => ({ current: value }), useState: initial => {
  const index = cursor++;
  if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
  return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
} };
function load(path, deps) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, require: name => deps[name], URLSearchParams, structuredClone, crypto: { randomUUID: () => 'unused' } });
  return exports;
}
const Button = () => null, Component = () => null;
const records = ['Alice', 'Bea'].map((name, index) => ({ id: name, requestedBy: name, requesterName: name, businessUnitName: 'Fixture unit',
  date: new Date('2026-10-19T12:00:00+08:00'), startDate:'2026-10-19', endDate:'2026-10-19',
  coverageDays:[{date:'2026-10-19',coverageRequired:true,totalStaff:index+1,totalCost:index?1400:800,reason:'Coverage shortage',items:[{onCallNeeded:index+1,justification:'Coverage shortage'}]}],
  grandTotal:index?1400:800, status:'Pending', approvalStage:'BOD_GM', clarificationStatus:'none', revision:1, approvalRouteStep:0, approvalSnapshot:{revision:1,grand_total:index?1400:800},
  createdAt:new Date('2026-10-18T10:00:00Z') }));
const queue = pendingNTEApprovals => new Proxy({ pendingNTEApprovals, refreshAdditionalApprovals: async () => {} }, { get: (target, key) => key in target ? target[key] : String(key).startsWith('pending') ? [] : undefined });
const additional = queue([]);
const approvals = { pendingLeaveApprovals: [], pendingWfhApprovals: [], pendingOtApprovals: [], pendingManpowerApprovals: records, refreshApprovals: async () => {} };
const deps = new Proxy({
  react: hooks, 'react-router-dom': { useLocation: () => ({ key: 'test' }), useNavigate: () => noop, useSearchParams: () => [new URLSearchParams('type=manpower')], Link: Component },
  '../types': load('types.ts', {}), '../hooks/useAuth': { useAuth: () => ({ user: { id: 'reviewer', roles: [] } }) },
  '../hooks/useApprovals': { useApprovals: () => approvals }, '../hooks/useAdditionalApprovals': { useAdditionalApprovals: () => additional },
  '../services/attendanceIssues': { useAttendanceIssues: () => ({ pending: [], rows: [] }) },
  '../context/SettingsContext': { useSettings: () => ({ approverConfigs: { conditionalTimeApprovals: { valid: true } } }) },
  '../services/approvalDeepLinks': { getApprovalRequestId: () => null, getApprovalReviewUrl: (kind, id) => '/feedback/nte/' + id },
  '../utils/approvalPresentation': { approvalContextNumber: () => undefined, getOvertimeWeekDetails: () => ({}), isBodApprovalStatus: () => false, getApprovalStatusLabel: value => value },
  '../components/ui/Button': { __esModule: true, default: Button },
  '../utils/onCallApprovalSummary': load('utils/onCallApprovalSummary.ts', {}),
  '../services/onCallBatchApproval': { approveOnCallBatch: async (items, progress) => { calls.push(items); await new Promise(resolve => { release = resolve; }); progress({ succeeded: items.length, skipped: 0, failed: 0, processed: items.length }); } },
}, { get: (target, key) => key in target ? target[key] : { __esModule: true, default: Component } });
const Page = load('pages/ApprovalCenter.tsx', deps).default;
function render() { cursor = 0; return Page(); }
function all(node, test, hits = []) {
  if (!React.isValidElement(node)) return hits;
  if (test(node)) hits.push(node);
  for (const child of React.Children.toArray(node.props.children)) all(child, test, hits);
  return hits;
}
function text(node) { if (typeof node === 'string' || typeof node === 'number') return String(node); return React.isValidElement(node) ? React.Children.toArray(node.props.children).map(text).join('') : ''; }
const button = (tree, label) => all(tree, e => e.type === Button && text(e).startsWith(label))[0];
let tree = render();
assert.equal(button(tree, 'Approve selected').props.disabled, true);
assert.ok(button(tree, 'Approve all shown'));
const checkbox = all(tree, e => e.type === 'input' && e.props['aria-label'] === 'Select MP-ALICE for bulk approval')[0];
assert.ok(checkbox, 'NTE row has a selection checkbox.');
checkbox.props.onChange({ target: { checked: true } });
tree = render();
assert.equal(button(tree, 'Approve selected').props.disabled, false);
button(tree, 'Approve selected').props.onClick();
tree = render();
const dialog = all(tree, e => e.props.role === 'dialog')[0];
assert.match(text(dialog), /Alice · MP-ALICE/); assert.doesNotMatch(text(dialog), /Bea · MP-BEA/);
const confirmation = all(dialog, e => e.type === 'input' && e.props.type === 'checkbox')[0];
confirmation.props.onChange({ target: { checked: true } });
tree = render();
const approve = all(all(tree, e => e.props.role === 'dialog')[0], e => e.type === Button && text(e).startsWith('Approve '))[0];
const pending = approve.props.onClick();
tree = render();
assert.equal(button(tree, 'Approve all shown').props.disabled, true);
assert.ok(all(tree, e => e.props.role === 'status').some(e => text(e).includes('Processing')));
assert.equal(calls.length, 1); assert.equal(calls[0].length, 1); assert.equal(calls[0][0].id, 'Alice');
release(); await pending;
// Search narrows approve-all to only the rows displayed by current filters.
state = []; tree = render();
all(tree, e => e.type === 'button' && text(e) === 'Filter requests')[0].props.onClick();
tree = render();
const search = all(tree, e => e.type === 'input' && e.props['aria-label'] === 'Approval search')[0];
assert.ok(search); search.props.onChange({ target: { value: 'Bea' } });
tree = render(); button(tree, 'Approve all shown').props.onClick(); tree = render();
const filteredDialog = all(tree, e => e.props.role === 'dialog')[0];
assert.match(text(filteredDialog), /Bea · MP-BEA/); assert.doesNotMatch(text(filteredDialog), /Alice · MP-ALICE/);
const mobileCards = all(tree, e => e.props.item?.kind === 'manpower');
assert.equal(mobileCards[0].props.item.bulkSelectable, true);
assert.ok(mobileCards[0].props.item.onCallSummary.totalCost > 0);
const mobile = mobileCards[0].type(mobileCards[0].props);
assert.doesNotMatch(text(mobile), /Assigned approval required|Additional BOD approval|Submitted|Pending days/);
assert.ok(all(mobile, e => e.type === 'input' && e.props.type === 'checkbox').length, 'Mobile NTE card has a checkbox.');
const cancel = all(filteredDialog, e => e.type === Button && text(e) === 'Cancel')[0]; cancel.props.onClick();
tree = render();
all(tree, e => e.type === 'input' && e.props['aria-label'] === 'Approval search')[0].props.onChange({target:{value:''}});
tree = render();
const selectAll = all(tree, e => e.type === 'label' && text(e).trim().startsWith('Select all shown on-call requests'))[0];
all(selectAll, e => e.type === 'input')[0].props.onChange({target:{checked:true}});
tree = render(); button(tree, 'Approve selected').props.onClick(); tree = render();
const allDialog = all(tree, e => e.props.role === 'dialog')[0];
assert.match(text(allDialog), /Alice · MP-ALICE/); assert.match(text(allDialog), /Bea · MP-BEA/);
assert.match(text(allDialog), /Total selected cost:.*2,200/);
console.log('PASS on-call controls: row selection, selected-only confirmation, progress/disabled controls, filtered approve-all.');
