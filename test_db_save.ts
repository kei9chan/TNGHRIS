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
    console.log("Checking if logo_url accepts large data URLs...");
    
    // Create a large 10KB string
    const largeStr = "data:image/jpeg;base64," + "A".repeat(10000);
    
    const payload = {
        title: "Debug Template",
        body: "Debug Body",
        from: "Debug",
        subject: "Debug",
        cc: "",
        logo_url: largeStr,
        signatory_name: "Test",
        signatory_title: "Test",
        signatory_signature_url: null,
    };
    
    console.log("Attempting to insert...");
    const { data, error } = await supabase
        .from('feedback_templates')
        .insert(payload)
        .select()
        .single();
        
    if (error) {
        console.error("INSERT ERROR:", error);
    } else {
        console.log("INSERT SUCCESS! ID:", data.id);
        console.log("logo_url length in DB:", data.logo_url?.length);
        
        // Clean up
        await supabase.from('feedback_templates').delete().eq('id', data.id);
    }
}

testSupabase();
