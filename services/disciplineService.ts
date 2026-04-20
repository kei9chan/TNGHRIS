import { supabase } from './supabaseClient';
import { CodeOfDiscipline, DisciplineEntry, SanctionStep, SeverityLevel } from '../types';

// ---------------------------------------------------------------------------
// Row Type
// ---------------------------------------------------------------------------
type DisciplineEntryRow = {
  id: string;
  code: string;
  category: string;
  description: string;
  severity_level: string;
  sanctions: any;
  last_modified_at: string;
  last_modified_by_user_id: string;
  version?: string | null;
};

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------
const mapDisciplineEntry = (row: DisciplineEntryRow): DisciplineEntry => ({
  id: row.id,
  code: row.code,
  category: row.category,
  description: row.description,
  severityLevel: row.severity_level as SeverityLevel,
  sanctions: Array.isArray(row.sanctions) ? (row.sanctions as SanctionStep[]) : [],
  lastModifiedAt: new Date(row.last_modified_at),
  lastModifiedByUserId: row.last_modified_by_user_id,
});

// ---------------------------------------------------------------------------
// Service Methods
// ---------------------------------------------------------------------------

export const fetchCodeOfDiscipline = async (): Promise<CodeOfDiscipline> => {
  const { data, error } = await supabase.from('discipline_entries').select('*').order('code', { ascending: true });
  if (error) throw new Error(error.message || 'Failed to fetch discipline entries');

  const entries = (data as DisciplineEntryRow[]).map(mapDisciplineEntry);
  
  // Get version info from the first entry or default
  const version = data.length > 0 && (data[0] as DisciplineEntryRow).version ? (data[0] as DisciplineEntryRow).version! : '1.0';
  
  return {
    version,
    effectiveDate: entries.length > 0 ? entries[0].lastModifiedAt : new Date(),
    entries,
  };
};

export const saveDisciplineEntry = async (entry: Partial<DisciplineEntry>): Promise<DisciplineEntry> => {
  const payload = {
    code: entry.code,
    category: entry.category,
    description: entry.description,
    severity_level: entry.severityLevel,
    sanctions: entry.sanctions || [],
    last_modified_at: new Date().toISOString(),
    last_modified_by_user_id: entry.lastModifiedByUserId,
  };

  const { data, error } = entry.id
    ? await supabase.from('discipline_entries').update(payload).eq('id', entry.id).select().single()
    : await supabase.from('discipline_entries').insert(payload).select().single();

  if (error) throw new Error(error.message || 'Failed to save discipline entry');
  return mapDisciplineEntry(data as DisciplineEntryRow);
};
