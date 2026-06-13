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
const supabase = createClient(supabaseUrl, anonKey);

async function checkBucket() {
    const { data, error } = await supabase.storage.getBucket('feedback-templates-assets');
    if (error) {
        console.error("Error getting bucket:", error.message);
    } else {
        console.log("Bucket info:", data);
        console.log("Is Public?", data.public);
    }
}
checkBucket();
