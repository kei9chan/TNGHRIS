import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = async relativePath => readFile(path.join(root, relativePath), 'utf8');

const app = await source('App.tsx');
const publicCareers = await source('services/publicCareersService.ts');
const openRoles = await source('components/recruitment/OpenRolesPage.tsx');
const rolePage = await source('components/recruitment/CareerRolePage.tsx');
const applicationPage = await source('components/recruitment/CareerApplicationPage.tsx');
const migration = await source('supabase/migrations/20260822030000_recruitment_application_flow.sql');

assert.match(app, /path="\/careers\/:slug\/apply\/:roleSlug"/);
assert.match(app, /path="\/careers\/:slug\/apply"/);
assert.match(publicCareers, /getApplicationPath/);
assert.match(publicCareers, /roleId=/);
assert.match(publicCareers, /isJobCurrentlyOpen/);
assert.match(openRoles, /Submit General Application/);
assert.match(rolePage, /This role is no longer accepting applications/);
assert.match(applicationPage, /Personal Information/);
assert.match(applicationPage, /Experience/);
assert.match(applicationPage, /Final Details/);
assert.match(applicationPage, /recruitment-uploads/);
assert.match(applicationPage, /MAX_RESUME_SIZE = 5 \* 1024 \* 1024/);
assert.match(applicationPage, /role_id: liveJob\?\.id \|\| null/);
assert.match(applicationPage, /submission_token: submissionToken/);
assert.match(applicationPage, /This role is no longer accepting applications/);
assert.match(applicationPage, /Submit Application/);
assert.match(migration, /add column if not exists role_id text/);
assert.match(migration, /add column if not exists role_answers jsonb/);
assert.match(migration, /add column if not exists submission_token text/);
assert.match(migration, /alter column job_post_id drop not null/);
assert.match(migration, /Public applicants can upload resumes/);

console.log('Recruitment flow smoke test passed.');
