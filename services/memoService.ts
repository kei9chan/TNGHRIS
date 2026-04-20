import { supabase } from './supabaseClient';
import { Memo, MemoAcknowledgement } from '../types';

// ---------------------------------------------------------------------------
// Row Type
// ---------------------------------------------------------------------------
type MemoRow = {
  id: string;
  title: string;
  body: string;
  effective_date: string;
  target_departments: any;
  target_business_units: any;
  acknowledgement_required: boolean;
  tags: any;
  attachments: any;
  acknowledgement_tracker: any;
  acknowledgement_signatures?: any;
  status: string;
};

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------
const mapMemo = (row: MemoRow): Memo => ({
  id: row.id,
  title: row.title,
  body: row.body,
  effectiveDate: new Date(row.effective_date),
  targetDepartments: Array.isArray(row.target_departments) ? row.target_departments : [],
  targetBusinessUnits: Array.isArray(row.target_business_units) ? row.target_business_units : [],
  acknowledgementRequired: row.acknowledgement_required,
  tags: Array.isArray(row.tags) ? row.tags : [],
  attachments: Array.isArray(row.attachments) ? row.attachments : [],
  acknowledgementTracker: Array.isArray(row.acknowledgement_tracker) ? row.acknowledgement_tracker : [],
  acknowledgementSignatures: Array.isArray(row.acknowledgement_signatures) ? (row.acknowledgement_signatures as MemoAcknowledgement[]) : [],
  status: row.status as Memo['status'],
});

// ---------------------------------------------------------------------------
// Service Methods
// ---------------------------------------------------------------------------

export const fetchMemos = async (): Promise<Memo[]> => {
  const { data, error } = await supabase.from('memos').select('*').order('effective_date', { ascending: false });
  if (error) throw new Error(error.message || 'Failed to fetch memos');
  return (data as MemoRow[]).map(mapMemo);
};

export const saveMemo = async (memo: Partial<Memo>): Promise<Memo> => {
  const payload = {
    title: memo.title,
    body: memo.body,
    effective_date: memo.effectiveDate ? new Date(memo.effectiveDate).toISOString().split('T')[0] : null,
    target_departments: memo.targetDepartments || [],
    target_business_units: memo.targetBusinessUnits || [],
    acknowledgement_required: memo.acknowledgementRequired ?? false,
    tags: memo.tags || [],
    attachments: memo.attachments || [],
    acknowledgement_tracker: memo.acknowledgementTracker || [],
    acknowledgement_signatures: memo.acknowledgementSignatures || [],
    status: memo.status || 'Draft',
  };

  const { data, error } = memo.id
    ? await supabase.from('memos').update(payload).eq('id', memo.id).select().single()
    : await supabase.from('memos').insert(payload).select().single();

  if (error) throw new Error(error.message || 'Failed to save memo');
  return mapMemo(data as MemoRow);
};
