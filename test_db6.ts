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
// using postgres direct connection isn't available from browser, but maybe RPC is not needed. 
// Can we query `information_schema` directly? No, REST API doesn't allow it.
// Can we query another request?
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('ot_requests').select('*').limit(1);
  console.log("Error details:", error);
}
check();
