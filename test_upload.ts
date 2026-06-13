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

async function testUpload() {
  const dummyFile = Buffer.from('fake image data');
  const { data, error } = await supabase.storage.from('feedback-templates-assets').upload('test.jpg', dummyFile, { contentType: 'image/jpeg' });
  console.log("Upload error:", error);
  console.log("Upload data:", data);
}

testUpload();
