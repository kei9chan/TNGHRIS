import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260911113000_attendance_pulse_11am_concern_only.sql', 'utf8');
const delivery = fs.readFileSync('api/attendance-issues/deliver.ts', 'utf8');

assert.match(migration, /set summary_hour=11/);
assert.match(migration, /current_concern:=coalesce\(\(data->>'reported'\)::integer,0\)>0/);
assert.match(migration, /extract\(hour from now\(\) at time zone 'Asia\/Manila'\)>=cfg\.summary_hour/);
assert.match(migration, /attendance_pulse\.late_summary\(h\.id,d-1\)/);
assert.match(migration, /h\.id\|\|'[^']*:'\|\|d\|\|'[^']*daily/);
assert.match(migration, /h\.id\|\|'[^']*:'\|\|\(d-1\)\|\|'[^']*late/);
assert.match(migration, /summaryType','late'/);
assert.match(delivery, /p\.summaryType==='late'/);
assert.match(delivery, /11:00 AM Philippine-time/);
assert.match(delivery, /Late attendance summary/);
console.log('attendance pulse 11 AM rules passed');
