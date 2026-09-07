import { PAN, PANStatus } from '../types';
import { getPANActionType } from './panTemplateUtils';
export function panAmount(value: unknown, label: string): number {
  if (value == null || (typeof value === 'string' && !value.trim())) return 0;
  const normalized = typeof value === 'string' ? value.trim().replace(/^(PHP|₱)\s*/i, '').replace(/,/g, '').trim() : value;
  if (typeof normalized === 'string' && !/^\d+(\.\d{0,2})?$/.test(normalized)) throw new Error(`${label}: enter a valid non-negative amount with up to two decimal places.`);
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`${label}: enter a valid non-negative amount.`);
  return amount;
}
export function panPayload(record: Partial<PAN>, creatorId: string) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!record.employeeId || !uuid.test(record.employeeId)) throw new Error('Employee: select a valid employee.');
  if (!record.employeeName?.trim()) throw new Error('Employee name is missing. Please select the employee again.');
  const date = record.effectiveDate && new Date(record.effectiveDate);
  if (!date || !Number.isFinite(date.getTime())) throw new Error('Effective date: enter a valid date.');
  const particulars: any = { ...record.particulars };
  for (const side of ['from', 'to'] as const) {
    const source = record.particulars?.[side];
    particulars[side] = { ...source, salary: Object.fromEntries(['basic','deminimis','reimbursable'].map(field => [field, panAmount(source?.salary?.[field], `${side === 'from' ? 'Current' : 'New'} ${field}`)])) };
  }
  // Production stores PAN particulars as JSON. Preserve template metadata here,
  // without depending on optional columns from a different schema version.
  particulars.panTemplate = { version: record.templateVersion, name: record.templateName, snapshot: record.templateSnapshot, actionType: record.actionType || getPANActionType(record.actionTaken) };
  const optional = { signed_at: record.signedAt, signature_data_url: record.signatureDataUrl, signature_name: record.signatureName, logo_url: record.logoUrl, pdf_hash: record.pdfHash, preparer_name: record.preparerName, preparer_signature_url: record.preparerSignatureUrl, template_id: record.templateId, business_unit_id: record.businessUnitId || record.particulars?.from?.businessUnitId };
  for (const [field, value] of Object.entries(optional)) if (field.endsWith('_id') && value && !uuid.test(String(value))) throw new Error(`${field}: select a valid record.`);
  return { id: record.id, employee_id: record.employeeId, employee_name: record.employeeName.trim(), effective_date: `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`, status: PANStatus.Draft,
    created_by_user_id: record.createdByUserId || creatorId, action_taken: record.actionTaken || {}, particulars, salary_from: particulars.from.salary,
    tenure: record.tenure || '', notes: record.notes || '', routing_steps: record.routingSteps || [], ...Object.fromEntries(Object.entries(optional).map(([k,v])=>[k,v || null])), updated_at: new Date().toISOString() };
}
export function panSaveError(error: any, stage: string) {
  console.error(`PAN ${stage} failed`, error);
  return new Error(`${stage}: ${error?.message || 'The server did not confirm the operation.'}${error?.code ? ` (${error.code})` : ''}`);
}
