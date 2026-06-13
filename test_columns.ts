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

async function testSupabase() {
    console.log("Fetching one row to check columns...");
    
    // Just fetch any row to see what columns come back
    const { data, error } = await supabase
        .from('feedback_templates')
        .select('*')
        .limit(1);
        
    if (error) {
        console.error("SELECT ERROR:", error);
    } else {
        if (data && data.length > 0) {
            console.log("Columns found in feedback_templates:", Object.keys(data[0]));
        } else {
            console.log("Table is empty or RLS blocked read.");
        }
    }
}

testSupabase();
