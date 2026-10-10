import fs from 'node:fs';
import {createAssetMaintenanceFixture,id} from './assetMaintenanceFixture.mjs';
export {id};
export const migrationPath='supabase/migrations/20261010085950_operations_maintenance_plans_history.sql';
export async function createMaintenanceFixture(dir){const db=await createAssetMaintenanceFixture(dir);await db.exec(fs.readFileSync(migrationPath,'utf8'));return db;}
