import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync('services/supabaseClient.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText.replaceAll('import.meta.env', '{ VITE_SUPABASE_URL: "https://example.invalid", VITE_SUPABASE_ANON_KEY: "test" }');
const exports = {};
vm.runInNewContext(source, {
  exports,
  require: name => name === '@supabase/supabase-js'
    ? { createClient: () => ({}) }
    : name === './authDeadline'
      ? { withAuthDeadline: promise => promise, fetchWithAuthTimeout: () => {} }
      : { recordRequestTiming() {} },
  window: { setTimeout: callback => setTimeout(callback, 0) },
  AbortController,
});

for (const status of [429, 500, 503]) {
  let calls = 0;
  const result = await exports.retryTransientSupabaseRead(async () => {
    calls++;
    return calls === 1 ? { error: { status, message: 'Gateway failure' } } : { data: 'verified', error: null };
  });
  assert.equal(calls, 2, `${status} should be retried before access is denied`);
  assert.equal(result.data, 'verified');
}
for (const code of ['53300', '57P03', '08006']) {
  assert.equal(exports.isTransientNetworkError({ code }), true, `${code} is a temporary database failure`);
}
assert.equal(exports.isTransientNetworkError({ status: 403, code: '42501' }), false, 'permission denial must fail closed');
console.log('PASS: temporary gateway/database failures retry; permission denial stays blocked.');
