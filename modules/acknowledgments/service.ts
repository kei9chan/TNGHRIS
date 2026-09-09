import { supabase } from '../../services/supabaseClient';
export const STATEMENT = 'I acknowledge that I have received and opened this document and have been given the opportunity to read and understand its contents. I understand that this acknowledgment confirms receipt and review and does not necessarily mean that I agree with every provision.';
export const GATE_MESSAGE = 'You have one or more announcements, policies, or memorandums that require your acknowledgment. Please open and acknowledge all pending documents before submitting this request.';
export async function ackRpc<T = any>(name: string, args: Record<string, unknown> = {}): Promise<T> {
 const { data, error } = await supabase.rpc(name, args);
 if (error) throw new Error(error.message);
 return data as T;
}
export const manila = (value?: string) => value ? new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
export function download(name: string, content: string, mime = 'text/plain') {
 const url = URL.createObjectURL(new Blob([content], { type: mime }));
 const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function receiptText(r: any) {
 const d = r.document_snapshot, e = r.employee_snapshot;
 return ['Document Acknowledgment Receipt', `Reference: ${r.id}`, `Employee: ${e.name}`, `Employee number: ${e.number || '—'}`, `Document: ${d.title}`, `Type: ${d.document_type}`, `Document reference: ${d.reference_number || '—'}`, `Version: ${d.version_number}`, `Opened: ${manila(r.first_viewed_at)}`, `Acknowledged: ${manila(r.acknowledged_at)} (Asia/Manila)`, '', r.statement, '', `Server timestamp: ${r.acknowledged_at}`, `SHA-256: ${r.content_hash}`, `Authenticated account: ${r.auth_user_id}`].join('\n');
}
export async function archiveAttachments(doc: any) {
 return Promise.all((doc.attachments || []).map(async (path: string) => {
  let url = path;
  if (!/^https:\/\//i.test(path)) {
   const { data, error } = await supabase.storage.from(doc.source === 'announcements' ? 'announcements_attachments' : 'memo_attachments').createSignedUrl(path, 300);
   if (error || !data) throw new Error('Cannot load attachment. Publication was not completed.');
   url = data.signedUrl;
  }
  const response = await fetch(url); if (!response.ok) throw new Error('Attachment failed to load.');
  const blob = await response.blob();
  const mime = blob.type.split(';')[0];
  if (!['application/pdf','image/png','image/jpeg','text/plain'].includes(mime) || blob.size > 5242880 || !blob.size) throw new Error('Each attachment must be PDF, PNG, JPEG or text, up to 5 MB.');
  const base64 = await new Promise<string>((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(blob); });
  return { name: path.split('/').pop()?.split('?')[0] || 'Document attachment', mime, base64 };
 }));
}
