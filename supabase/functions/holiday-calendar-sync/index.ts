import { annual, oneOff, strip, type Holiday } from './parser.ts';
const base = 'https://lawphil.net/executive/proc/';
async function fetchText(url: string) {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'TNGHRIS-holiday-calendar/1.0' } });
      if (!response.ok) throw Error(`Source returned HTTP ${response.status}`);
      const text = await response.text();
      if (text.length > 500000 || text.length < 1000) throw Error('Unexpected proclamation response size');
      return text;
    } catch (e) {
      last = e;
      if (String(e).includes('404')) break;
    }
  }
  throw last;
}
async function scan(year: number): Promise<Holiday[]> {
  let index: string;
  try { index = await fetchText(`${base}proc${year}/proc${year}.html`); }
  catch (e) { if (year > new Date().getUTCFullYear() && String(e).includes('404')) return []; throw e; }
  const entries = [...index.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/gi)].map(x => x[0]);
  const relevant = entries.filter(row => {
    const summary = strip(row);
    return /href="(proc_(\d+)_\d{4}\.html)"/i.test(row) && /Declaring/i.test(summary)
      && /Holidays.*Year \d{4}|(?:Regular Holiday|Special \(Non-Working\) Day)/i.test(summary)
      && /Holidays.*Year \d{4}|National Capital Region|Throughout the Country|Entire Country|Nationwide/i.test(summary);
  });
  const groups = await Promise.all(relevant.map(async row => {
    const link = row.match(/href="(proc_(\d+)_\d{4}\.html)"/i)!;
    const url = `${base}proc${year}/${link[1]}`;
    const body = await fetchText(url);
    const annualYear = Number(strip(row).match(/Holidays.*Year\s+(\d{4})/i)?.[1]);
    return annualYear ? annual(body, annualYear, link[2], url) : oneOff(body, year, link[2], url);
  }));
  return groups.flat();
}
Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const endpoint = Deno.env.get('SUPABASE_URL');
  const token = request.headers.get('x-holiday-worker');
  if (!service || !endpoint || !token) return new Response('Unauthorized', { status: 401 });
  const rpc = async (name: string, data: unknown) => {
    const response = await fetch(`${endpoint}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!response.ok) throw Error(`Calendar RPC ${response.status}: ${(await response.text()).slice(0, 200)}`);
    return response.json();
  };
  try {
    const authorized = await rpc('authorize_payroll_holiday_sync', { p_token: token });
    if (authorized !== true) return new Response('Unauthorized', { status: 401 });
    const year = new Date().getUTCFullYear();
    const events = await scan(year);
    const outcome = await rpc('apply_payroll_government_proclamations', { p_events: events });
    return Response.json({ ok: true, candidates: events.length, outcome });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : 'Sync failed' }, { status: 503 });
  }
});
