export type OpsKind = 'task' | 'checklist';
export type OpsStatus = 'Assigned' | 'In Progress' | 'Completed' | 'Cancelled';
export type OpsPriority = 'Low' | 'Normal' | 'High' | 'Urgent';
export type OpsResponse = 'none' | 'text' | 'photo' | 'numeric' | 'yes_no';
export interface OpsContent {
  title: string; allow_na?: boolean; photo_required?: boolean; unit?: string; min?: number | null; max?: number | null; description?: string; department_id?: string; category?: string;
  instructions?: string; sop_url?: string; priority?: OpsPriority; frequency?: string;
  duration?: number; position?: string; asset_id?: string; evidence?: OpsResponse;
  safety_critical?: boolean; location?: string; positions?: string; responsible_manager_id?: string;
  items?: OpsItemDraft[];
}
export interface OpsItemDraft { rules?: Pick<OpsContent,'allow_na'|'photo_required'|'unit'|'min'|'max'>; task_version_id?: string; snapshot?: OpsContent; required: boolean; response_type: OpsResponse }
export interface OpsItem extends OpsItemDraft { id: string; ordinal: number; snapshot: OpsContent }
export interface OpsVersion { id: string; version: number; content: OpsContent; items: OpsItem[]; published_at: string; published_by: string }
export interface OpsTemplate { id: string; created_by: string; kind: OpsKind; business_unit_id: string | null; status: 'Draft' | 'Published' | 'Archived'; draft: OpsContent; revision: number; latest_version: number; versions: OpsVersion[] }
export interface OpsCheck { item_id: string; checked: boolean; revision: number; actor_name: string | null; updated_at: string | null }
export interface OpsEvidence { id:string; path:string; bytes:number; state:'Pending'|'Ready'|'Removed'|'Expired'; accessible:boolean; uploader_name:string; uploaded_at:string|null; created_at:string; expires_at:string; deleted_at:string|null }
export interface OpsRunItem {id:string;ordinal:number;snapshot:OpsContent;required:boolean;response_type:OpsResponse;response:{value:boolean|number|string|null;remarks:string;issue:boolean;revision:number;actor_name:string|null;updated_at:string|null};error:string|null;evidence:OpsEvidence[]}
export interface OpsExecution {id:string;execution_phase:number;shared:boolean;revision:number;submitted_at:string|null;outcome:'Pending'|'Clear'|'Issues';can_write:boolean;can_reopen:boolean;items:OpsRunItem[]}
export interface OpsAssignment { occurrence_id?: string | null; execution?: OpsExecution | null; checklist_run_id?: string | null; members?: {id:string;name:string}[]; checks?: OpsCheck[]; can_check?: boolean; id: string; batch_id: string; business_unit_id: string; unit_name: string; template_version_id: string; assignee_id: string; assignee_name: string; assignee_is_bum: boolean; created_by: string; kind: OpsKind; content: OpsContent; version: number; due_at: string; priority: OpsPriority; instructions: string; attachments: {name: string; url: string}[]; requires_verification: boolean; verification_status: string; status: OpsStatus; revision: number; can_cancel: boolean; items: OpsItem[]; history: {id: string; action: string; actor_id: string; actor_name?: string; created_at: string; detail: {note?: string; from?: string; item_title?: string}}[] }
export interface OpsWorkspace {
  actor: string; masterAdmin: boolean;
  units: {id: string; name: string; manage: boolean; edit: boolean; assign: boolean}[];
  departments: {id: string; name: string}[];
  people: {id: string; name: string; position: string; roles: string[]; department_id: string; bum: boolean; can_assign: boolean}[];
  assets: {id: string; name: string}[];
  templates: OpsTemplate[]; assignments: OpsAssignment[];
  permissions: {user_id: string; can_create: boolean; can_assign: boolean}[];
}
