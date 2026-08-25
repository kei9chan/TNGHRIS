import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [html, themeContext, header, approvalCenter, signaturePad, app] = await Promise.all([
  read('index.html'),
  read('context/ThemeContext.tsx'),
  read('components/layout/Header.tsx'),
  read('pages/ApprovalCenter.tsx'),
  read('components/ui/SignaturePad.tsx'),
  read('App.tsx'),
]);

assert.match(html, /tailwind\.config\s*=\s*\{\s*darkMode:\s*'class'/, 'Tailwind dark mode must be controlled by the app class');
assert.match(html, /getItem\('tng-hris-theme'\) === 'dark' \? 'dark' : 'light'/, 'First visit must default to light mode');
assert.doesNotMatch(themeContext, /prefers-color-scheme/, 'Theme provider must not inherit the device theme');
assert.match(themeContext, /document\.documentElement\.classList\.toggle\('dark'/, 'Theme provider must update the root class');
assert.match(app, /<ThemeProvider>/, 'Theme provider must wrap the app');

assert.match(header, /aria-label="Appearance"/, 'Profile menu must expose an accessible appearance control');
assert.match(header, /setTheme\('light'\)/, 'Profile menu must expose light mode');
assert.match(header, /setTheme\('dark'\)/, 'Profile menu must expose dark mode');
assert.doesNotMatch(header, /Switch to \$\{theme === 'dark'/, 'Theme control must not occupy the primary header');

assert.match(approvalCenter, /dark:bg-slate-700 dark:text-white dark:placeholder:text-slate-300/, 'Approval controls must retain dark-mode contrast');
assert.match(approvalCenter, /dark:disabled:bg-slate-600 dark:disabled:text-slate-100/, 'Disabled approver scope must remain readable');
assert.match(approvalCenter, /dark:bg-slate-600 dark:text-white/, 'Inactive quick filters must remain readable');

assert.doesNotMatch(signaturePad, /prefers-color-scheme/, 'Signature pad must follow the app theme');
assert.match(signaturePad, /theme === 'dark'/, 'Signature pad must render using the selected app theme');

console.log('Theme mode smoke test passed.');
