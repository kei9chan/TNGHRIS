import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const result = await build({
  stdin: { contents: `import React from 'react';
    import {renderToStaticMarkup} from 'react-dom/server';
    import Preview from './components/approvals/NTEApprovalPreview';
    export {getNTEAllegationPreview} from './utils/nteApprovalPreview';
    export const render = props => renderToStaticMarkup(<Preview {...props}/>);`, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'esm', packages: 'external',
});
const code = result.outputFiles[0].text.replace(/from "(react(?:-dom\/server|\/jsx-runtime)?)"/g, (_, pkg) => `from ${JSON.stringify('file://' + require.resolve(pkg))}`);
const { render, getNTEAllegationPreview } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const lateness = 'Reported late on October 12, 2026. Scheduled start: 9:00 AM; actual arrival: 9:17 AM (17 minutes late).';
assert.match(render({ category: 'Attendance', details: lateness }), /17 minutes late/);
assert.match(render({ category: 'Attendance', details: lateness }), /October 12, 2026/);
assert.doesNotMatch(render({ details: lateness }), /<details|configured approval policy/);
const long = lateness + ' Additional recorded incident context.'.repeat(30) + ' Final recorded detail.';
const preview = getNTEAllegationPreview(long);
assert.equal(preview.truncated, true);
assert.ok(preview.preview.length <= 481);
assert.ok(long.startsWith(preview.preview.slice(0, -1)));
const html = render({ category: 'Attendance', details: long });
assert.match(html, /<details/);
assert.match(html, /Show full allegations/);
assert.match(html, /Final recorded detail\./);
for (const details of [undefined, '', ' \n\t ']) {
  assert.match(render({ details }), /No allegation preview available/);
  assert.doesNotMatch(render({ details }), /<details|configured approval policy/);
}
assert.equal(getNTEAllegationPreview(' Late\n by   17 minutes. ').preview, 'Late by 17 minutes.');
const unsafe = render({ details: '<script>alert("test")</script>' });
assert.doesNotMatch(unsafe, /<script>/);
assert.match(unsafe, /&lt;script&gt;/);
console.log('PASS NTE previews: exact dates/minutes, bounded excerpt, full expansion, empty fallback, escaped content');
