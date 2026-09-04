import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Kept as a fail-closed compatibility endpoint so stale clients cannot silently
// use the old shared Calendar-era Google refresh token. Current clients call
// send-hris-email with a document ID, and that function verifies both RBAC and
// record-level RLS before loading the caller's encrypted Gmail connection.
Deno.serve((request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  return new Response(JSON.stringify({
    error: 'This email endpoint has been retired. Connect Gmail and retry from the current HRIS screen.',
    reconnect: true,
  }), {
    status: 410,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
});
