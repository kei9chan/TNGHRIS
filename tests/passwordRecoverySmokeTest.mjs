import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const expect = (condition, message) => { if (!condition) throw new Error(message); };

const forgot = read('pages/ForgotPassword.tsx');
const reset = read('pages/ResetPassword.tsx');
const admin = read('pages/admin/UserManagement.tsx');
const service = read('services/passwordManagementService.ts');
const edge = read('supabase/functions/password-management/index.ts');
const migration = read('supabase/migrations/20260825093000_password_reset_rate_limits.sql');

expect(forgot.includes('requestPasswordReset(email)'), 'Forgot Password must use the hardened recovery mail endpoint.');
expect(reset.includes('exchangeCodeForSession'), 'PKCE recovery codes must be exchanged.');
expect(reset.includes("verifyOtp({ type: 'recovery'"), 'Token-hash recovery links must be verified.');
expect(reset.includes('access_token: accessToken'), 'Implicit recovery links must establish a session.');
expect(reset.includes("must_change_password: false"), 'Successful password changes must clear the temporary-password flag.');
expect(admin.includes('PasswordManagementModal'), 'User Management must expose Admin password controls.');
expect(service.includes("'set_temporary_password'"), 'Admin temporary-password action is missing.');
expect(service.includes('error?.context?.json?.()'), 'Edge Function error responses must expose the server-provided reason.');
expect(edge.includes("scoped.rpc('has_active_role', { p_role: 'Admin' })"), 'Admin authorization must be server-resolved.');
expect(edge.includes('admin.auth.admin.updateUserById'), 'Temporary passwords must be written through the server-side Auth Admin API.');
expect(edge.includes('email_confirm: true'), 'An Admin temporary password must activate a legitimate linked Auth account.');
expect(edge.includes('admin.auth.admin.generateLink'), 'Recovery links must be generated server-side.');
expect(edge.includes('manualResetLink'), 'Admins need a secure recovery-link fallback when email delivery is unavailable.');
expect(edge.includes('If the button does not work'), 'Recovery emails need a visible fallback URL.');
expect(!edge.includes('temporaryPassword: temporaryPassword'), 'Temporary password must not be written to audit details.');
expect(migration.includes('enable row level security'), 'Recovery throttling data must have RLS enabled.');
expect(migration.includes('revoke all'), 'Recovery throttling data must not be client-readable.');

console.log('Password recovery and Admin password-management smoke checks passed.');
