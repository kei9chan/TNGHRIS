import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

const generator = read('pages/recruitment/JobSocialMediaPostGenerator.tsx');
const app = read('App.tsx');
const constants = read('constants.ts');
const subNav = read('components/layout/RecruitmentSubNav.tsx');

assert.match(generator, /MAX_POSITIONS = 10/);
assert.match(generator, /OUTPUT_SIZE = 1080/);
assert.match(generator, /application-page-assets/);
assert.match(generator, /job-social-media/);
assert.match(generator, /Generate All/);
assert.match(generator, /Download All/);
assert.match(generator, /backgroundHistory/);
assert.match(generator, /Upload background/);
assert.match(generator, /job_social_media_templates/);
assert.match(generator, /Edit template & text colors/);
assert.match(generator, /Job title text/);
assert.match(generator, /Headline text/);
assert.match(generator, /Contact \/ CTA text/);
assert.match(generator, /Save Template/);
assert.match(generator, /Update Template/);
assert.match(generator, /Save Copy/);
assert.match(generator, /fontFamily/);
assert.match(generator, /\[POSITION\]/);
assert.match(generator, /canvas\.width = OUTPUT_SIZE/);
assert.match(generator, /canvas\.height = OUTPUT_SIZE/);
assert.match(generator, /can\('JobPosts', Permission\.Manage\)/);
assert.match(app, /JobSocialMediaPostGenerator/);
assert.match(app, /path="job-social-media-generator"/);
assert.match(constants, /Social Media Generator/);
assert.match(subNav, /'Social Media Generator'/);

console.log('Job social media post generator smoke test passed.');
