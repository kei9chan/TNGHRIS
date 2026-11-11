import { supabase } from './supabaseClient';

type RecruitmentTable = 'job_candidates' | 'job_applications' | 'job_posts' | 'job_requisitions' | 'job_offers';

// PostgREST caps each response. Walk the visible rows by primary key so neither
// an unordered first page nor concurrent deletions can hide applicant records.
export async function fetchRecruitmentRows<Row extends { id: string }>(table: RecruitmentTable): Promise<Row[]> {
  const rows: Row[] = [];
  let cursor: string | undefined;
  for (;;) {
    let query = supabase.from(table).select('*').order('id', { ascending: true }).limit(500);
    if (cursor) query = query.gt('id', cursor);
    const { data, error } = await query;
    if (error) throw new Error(`Could not load ${table.replaceAll('_', ' ')}: ${error.message}`);
    if (!data?.length) return rows;
    const next = data[data.length - 1].id;
    if (!next || (cursor && next <= cursor)) throw new Error('Applicant data paging did not advance. Refresh and try again.');
    rows.push(...(data as Row[]));
    cursor = next;
  }
}

export function careerSourceSlug(path?: string): string | undefined {
  const slug = path?.match(/^\/careers\/([^/?#]+)\/apply(?:[/?#]|$)/)?.[1];
  if (!slug) return undefined;
  try { return decodeURIComponent(slug); } catch { return undefined; }
}
