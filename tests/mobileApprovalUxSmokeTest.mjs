import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [header, widget, approvalCenter, notifications, faq] = await Promise.all([
  read('components/layout/Header.tsx'),
  read('components/dashboard/ApprovalWidget.tsx'),
  read('pages/ApprovalCenter.tsx'),
  read('components/layout/NotificationBell.tsx'),
  read('components/helpdesk/FaqBot.tsx'),
]);

assert.doesNotMatch(widget, /Approve standard/, 'Dashboard queue must not imply that opening the queue approves requests');
assert.doesNotMatch(widget, /Standard requests|Review standard requests|review=eligible/, 'Dashboard must not expose the removed standard-request view');
assert.match(widget, /Review queue/, 'Dashboard must open the full pending queue');
assert.match(approvalCenter, /searchParams\.get\('review'\)/, 'Review links must apply their requested queue filter');

assert.match(header, /aria-label="Open navigation menu"/, 'Mobile header must expose a menu button');
assert.match(header, /id="mobile-navigation"/, 'Mobile header must render a side drawer');
assert.match(header, /hidden min-w-0 flex-1 lg:block/, 'Desktop horizontal navigation must be hidden on mobile');
assert.match(header, /overflow-y-auto overscroll-contain/, 'Mobile drawer must scroll vertically');
assert.match(header, /Your authorized modules/, 'Mobile drawer must retain permission-scoped navigation');
assert.match(header, /Appearance/, 'Appearance controls must live in the profile menu');

assert.match(approvalCenter, /const ApprovalMobileCard/, 'Approval Center must provide a dedicated mobile request card');
assert.match(approvalCenter, /Review request/, 'Every mobile card must expose a clear review action');
assert.match(approvalCenter, /lg:hidden/, 'Mobile cards and controls must have a responsive breakpoint');
assert.match(approvalCenter, /hidden overflow-x-auto lg:block/, 'Desktop table must remain available on large screens');
assert.match(approvalCenter, /Open filters/, 'Mobile filters must be collapsible');
assert.match(approvalCenter, /Clear filters/, 'Mobile filters must be resettable');
assert.match(approvalCenter, /Additional BOD approval required/, 'Cards must explain configured BOD routing');
assert.match(approvalCenter, /to=\{item\.reviewUrl\}/, 'Review buttons must preserve canonical deep links');

assert.match(notifications, /fixed left-4 right-4 top-16/, 'Mobile notifications must stay inside the viewport');
assert.match(faq, /location\.pathname === '\/approvals'/, 'The floating help button must not cover mobile approval actions');

console.log('Mobile approval UX smoke test passed.');
