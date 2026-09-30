const months: Record<string, number> = Object.fromEntries('january february march april may june july august september october november december'.split(' ').map((m, i) => [m, i + 1]));
export const strip = (html: string) => html.replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&(?:nbsp|amp|ntilde);/gi, ' ').replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();
const iso = (year: number, month: number, day: number) => {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) throw Error('Invalid proclaimed date');
  return d.toISOString().slice(0, 10);
};
export type Holiday = { date: string; name: string; kind: 'regular' | 'special_nonworking' | 'special_working'; proclamation: string; source: string; jurisdiction?: string };
export function annual(html: string, year: number, number: string, source: string): Holiday[] {
  const normalized = strip(html);
  if (!normalized.includes(`PROCLAMATION NO. ${number}`) || !normalized.includes(`FOR THE YEAR ${year}`)) return [];
  const section = html.match(/A\. Regular Holidays([\s\S]*?)<\/dir>\s*<\/dir>\s*<p class="jn"><b>Section 2\./i)?.[1];
  if (!section) return [];
  const boundaries = ['A. Regular Holidays', 'B. Special (Non-Working) Days', 'C. Special (Working) Day'];
  let kind: Holiday['kind'] = 'regular';
  const result: Holiday[] = [];
  for (const token of section.match(/<p>[^<]*<\/p>|<tr[^>]*>[\s\S]*?<\/tr>/gi) || []) {
    const plain = strip(token);
    if (plain.startsWith('B. Special')) { kind = 'special_nonworking'; continue; }
    if (plain.startsWith('C. Special')) { kind = 'special_working'; continue; }
    if (plain.startsWith('Additional Special (Non-Working) Days')) { kind = 'special_nonworking'; continue; }
    if (!token.toLowerCase().startsWith('<tr')) continue;
    const cells = [...token.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x => strip(x[1]));
    const day = Number(cells[2]), month = months[(cells[4] || '').split(' ')[0].toLowerCase()];
    if (!month || !day || !cells[0]) return [];
    // Some mirror transcriptions omit the heading after EDSA. The signed PDF identifies
    // the following four as additional special non-working days; require these exact names.
    if (kind === 'special_working' && /Chinese New Year|Black Saturday|All Souls|Christmas Eve/i.test(cells[0])) kind = 'special_nonworking';
    result.push({ date: iso(year, month, day), name: cells[0], kind, proclamation: number, source });
  }
  // Reject incomplete or unexpectedly changed transcriptions, rather than underpay holidays.
  return result.length >= 17 && result.some(x => x.name.includes('New Year')) && result.some(x => x.name.includes('Rizal')) ? result : [];
}
export function oneOff(html: string, year: number, number: string, source: string): Holiday[] {
  const body = strip(html);
  if (!body.includes(`PROCLAMATION NO. ${number}`) || !body.includes('BY THE PRESIDENT OF THE PHILIPPINES')) return [];
  const title = body.match(/DECLARING\s+(.{0,220}?)\s+(?:WHEREAS|NOW, THEREFORE)/i)?.[1] || '';
  if (!title.toLowerCase().includes(`${year}`)) return [];
  const kind: Holiday['kind'] | null = /SPECIAL\s*\(NON-WORKING\)/i.test(title) ? 'special_nonworking' : /REGULAR HOLIDAY/i.test(title) ? 'regular' : null;
  if (!kind) return [];
  const jurisdiction = /NATIONAL CAPITAL REGION/i.test(title) ? 'NCR' : /(?:THROUGHOUT THE COUNTRY|ENTIRE COUNTRY|NATIONWIDE)/i.test(title) ? undefined : null;
  if (jurisdiction === null) return []; // Other localities require a verified unit location map.
  const span = title.match(/\b(\d{1,2})\s*[-–]\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/);
  const single = title.match(/\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/);
  if (!span && !single) return [];
  const m = months[(span?.[3] || single?.[2] || '').toLowerCase()], y = Number(span?.[4] || single?.[3]);
  if (!m || y !== year) return [];
  const start = Number(span?.[1] || single?.[1]), end = Number(span?.[2] || single?.[1]);
  if (end < start || end - start > 6) return [];
  return Array.from({ length: end - start + 1 }, (_, i) => ({ date: iso(y, m, start + i), name: `Proclamation ${number} — ${jurisdiction || 'National'} holiday`, kind, proclamation: number, source, ...(jurisdiction ? { jurisdiction } : {}) }));
}
