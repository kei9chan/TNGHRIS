import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

let dotenvStr = fs.readFileSync('.env', 'utf8');
const env: Record<string, string> = {};
dotenvStr.split(/\r?\n/).forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2];
});

const supabaseUrl = env['VITE_SUPABASE_URL']?.trim() || '';
const supabaseKey = env['VITE_SUPABASE_ANON_KEY']?.trim() || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('ot_requests').update({
    status: 'Draft',
    submitted_at: null as any,
    history_log: [{ timestamp: new Date().toISOString(), action: 'Withdrawn' }],
    updated_at: new Date().toISOString()
  }).eq('id', '00000000-0000-0000-0000-000000000000');
  
  console.log("Error details:", error);
}
check();
