import { validEmail } from './approvalEmail.js';

// Called only after requireAdmin; never return payloads or credentials.
export async function allRows(query: () => any) {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await query().range(offset, offset + 499);
    if (error) throw new Error('Notification report could not be loaded');
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
export function emailProblem(user: any) {
  if (!user) return 'Profile unavailable';
  if (!user.email?.trim()) return 'Missing email';
  return validEmail(user.email) ? '' : 'Invalid email format';
}
export function enrichDelivery(delivery: any, user: any) {
  return { ...delivery, employee_name: user?.full_name || 'Profile unavailable',
    profile_email: user?.email || '', account_status: user?.status || 'Unknown',
    linked: Boolean(user?.auth_user_id), email_problem: emailProblem(user),
    suggested_fix: delivery.status === 'sent' ? '' :
      delivery.error_summary === 'Inactive or unlinked account' ? 'Review account status and login linkage in User Management; activate only if appropriate.' :
      emailProblem(user) ? 'Correct the profile email in User Management.' :
      delivery.status === 'failed' ? 'Review the delivery error and provider status before retrying.' : 'Review the recorded skip reason.' };
}
export async function reportProfiles(client: any, deliveries: any[]) {
  const profiles = new Map();
  const ids = [...new Set(deliveries.map(d => d.recipient_user_id))];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await client.from('hris_users').select('id,full_name,email,status,auth_user_id').in('id', ids.slice(i, i + 100));
    if (error) throw new Error('Recipient profiles could not be loaded');
    data.forEach((u: any) => profiles.set(u.id, u));
  }
  return deliveries.map(d => enrichDelivery(d, profiles.get(d.recipient_user_id)));
}
