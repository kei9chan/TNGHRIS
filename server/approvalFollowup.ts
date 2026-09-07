/** Verified hris_users + linked auth records, 2026-09-07. This is visibility only, never delegation. */
export const FOLLOWUP_ACCESS = Object.freeze({
  'a9e2df32-dc67-4bb2-b8a2-612f93c5ecd2': '7c95bb6b-f72e-495f-815b-0c3baa30363b',
} as Record<string, string>);
export function followupOwner(profile: any): string | null {
  return profile && profile.status?.toLowerCase() === 'active' && !profile.is_duplicate && profile.auth_user_id
    ? FOLLOWUP_ACCESS[profile.id] || null : null;
}
const DATES: Record<string, [string, string]> = {
  nte: ['ntes', 'created_at'], offer: ['job_offer_approval_requests', 'submitted_at'],
  asset: ['asset_requests', 'created_at'], leave: ['leave_requests', 'created_at'],
  wfh: ['wfh_requests', 'created_at'], overtime: ['ot_requests', 'submitted_at'],
  manpower: ['manpower_requests', 'created_at'], pan: ['pans', 'created_at'],
  requisition: ['job_requisitions', 'created_at'], award: ['employee_awards', 'submitted_at'],
};
export function summarizeTasks(tasks: any[], dates: Record<string, string | null>, now = new Date()) {
  const unique = new Map(tasks.map(t => [`${t.request_type}:${t.request_id}`, t]));
  const groups = new Map<string, { type: string; label: string; count: number; oldest: string | null }>();
  for (const [key, task] of unique) {
    const group = groups.get(task.request_type) || { type: task.request_type, label: task.type_label, count: 0, oldest: null };
    group.count++;
    const date = dates[key];
    if (date && Number.isFinite(Date.parse(date)) && (!group.oldest || Date.parse(date) < Date.parse(group.oldest))) group.oldest = date;
    groups.set(task.request_type, group);
  }
  const values = [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
  const oldest = values.map(g => g.oldest).filter(Boolean).sort((a, b) => Date.parse(a!) - Date.parse(b!))[0] || null;
  return { total: unique.size, groups: values, oldest, refreshedAt: now.toISOString() };
}
export async function loadFollowup(client: any, owner: string) {
  const { data: profile, error: profileError } = await client.from('hris_users').select('id,status,is_duplicate,auth_user_id').eq('id', owner).single();
  if (profileError || !profile || profile.status?.toLowerCase() !== 'active' || profile.is_duplicate || !profile.auth_user_id) throw new Error('Approval owner unavailable');
  const tasks: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.rpc('get_actionable_approval_tasks_for_actor', { p_actor: owner }).order('request_type').order('request_id').range(offset, offset + 999);
    if (error) throw new Error('Approval lookup failed');
    tasks.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  const dates: Record<string, string | null> = {};
  for (const type of new Set(tasks.map(t => t.request_type))) {
    const source = DATES[type];
    if (!source) continue; // New categories still count without inventing dates.
    const [table, column] = source;
    const ids = [...new Set(tasks.filter(t => t.request_type === type).map(t => t.request_id))];
    for (let start = 0; start < ids.length; start += 100) {
      const { data, error } = await client.from(table).select(`id,${column}`).in('id', ids.slice(start, start + 100));
      if (error) throw new Error('Approval dates unavailable');
      for (const row of data || []) dates[`${type}:${row.id}`] = row[column];
    }
  }
  return summarizeTasks(tasks, dates);
}
