import fs from 'node:fs';
import {createMaintenanceFixture,id} from './maintenanceFixture.mjs';
export {id};
export const snoozeMigration='supabase/migrations/20261010201727_operations_task_snooze_confirm.sql';
export async function createSnoozeFixture(dir){const db=await createMaintenanceFixture(dir);await db.exec(fs.readFileSync(snoozeMigration,'utf8'));return db;}
