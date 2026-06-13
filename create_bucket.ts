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

async function tryCreateBucket() {
  const { data, error } = await supabase.storage.createBucket('feedback-templates-assets', {
    public: true,
    fileSizeLimit: 20971520 // 20MB
  });
  console.log("Create bucket error:", error);
  console.log("Create bucket data:", data);
}

tryCreateBucket();
