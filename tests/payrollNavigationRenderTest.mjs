import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Render the real navigation with isolated auth/permission dependencies.
// Unlike a Vite build, this executes the component and catches missing imports.
function compile(path, dependencies = {}) {
  const source = readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(output, { exports, require(name) {
    if (!(name in dependencies)) throw new Error('Unexpected dependency: ' + name);
    return dependencies[name];
  } }, { filename: path });
  return exports;
}
const types = compile('types.ts');
const constants = compile('constants.ts', { './types': types });
let cases = 0;
for (const role of Object.values(types.Role)) {
  for (const group of ['Payroll', 'Timekeeping & Attendance', 'Compliance & Reports']) {
    const { default: Navigation } = compile('components/layout/PayrollSubNav.tsx', {
      react: { ...React, useState: () => [group, () => {}] },
      'react-router-dom': {
        useLocation: () => ({ pathname: '/payroll/access' }),
        useNavigate: () => () => {},
        NavLink: ({ to, children }) => React.createElement('a', { href: to }, children),
      },
      '../../hooks/useAuth': { useAuth: () => ({ user: { role, roles: [role] } }) },
      '../../hooks/usePermissions': { usePermissions: () => ({ can: () => true }) },
      '../../constants': constants,
    });
    const html = renderToStaticMarkup(React.createElement(Navigation));
    assert.match(html, /Payroll/);
    if (group === 'Payroll') assert.match(html, /Payroll Access/);
    if (group === 'Timekeeping & Attendance') {
      assert.equal(html.includes('href="/payroll/attendance-devices"'),
        [types.Role.Admin, types.Role.HRManager, types.Role.HRStaff].includes(role));
    }
    cases++;
  }
}
console.log('Payroll navigation render passed for ' + cases + ' role/group cases.');
