import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

let dotenvStr = '';
try {
  dotenvStr = fs.readFileSync('.env.local', 'utf8');
} catch {
  try {
    dotenvStr = fs.readFileSync('.env', 'utf8');
  } catch {}
}
const env: Record<string, string> = {};
dotenvStr.split(/\r?\n/).forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2];
});

const supabaseUrl = env['VITE_SUPABASE_URL']?.trim() || '';
const supabaseKey = env['VITE_SUPABASE_ANON_KEY']?.trim() || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  // Try to insert a dummy record and look at the error to see if columns are missing
  const { data, error } = await supabase.from('feedback_templates').insert({
    title: 'test schema',
    body: 'body',
    logo_url: 'logo',
    signatory_signature_url: 'sig'
  }).select('*');
  console.log("Insert error:", error);
}

check();
