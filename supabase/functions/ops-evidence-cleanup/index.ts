import {createCleanupHandler} from './worker.ts';
Deno.serve(createCleanupHandler({url:Deno.env.get('SUPABASE_URL')||'',key:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',fetch}));
