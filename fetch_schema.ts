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
const anonKey = env['VITE_SUPABASE_ANON_KEY']?.trim() || '';

async function fetchSchema() {
  const res = await fetch(`${supabaseUrl}/rest/v1/?apikey=${anonKey}`);
  const spec = await res.json();
  console.log("Keys:", Object.keys(spec.definitions || {}));
}

fetchSchema();
