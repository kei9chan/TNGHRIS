import fs from 'node:fs';
import {createSnoozeFixture,id} from './operationsSnoozeFixture.mjs';
export {id};
export const eventMigration='supabase/migrations/20261010204414_operations_event_checklists.sql';
export async function createEventFixture(dir){const db=await createSnoozeFixture(dir);await db.exec(fs.readFileSync(eventMigration,'utf8'));return db;}
