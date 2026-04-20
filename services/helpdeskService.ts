import { supabase } from './supabaseClient';
import {
  Ticket, Announcement, KnowledgeBaseCategory, KnowledgeBaseArticle,
  UserDocument, DeviceBind, ChangeHistory, EmployeeDraft, CalendarEvent,
} from '../types';

// ---------------------------------------------------------------------------
// Row Types
// ---------------------------------------------------------------------------
type TicketRow = {
  id: string; subject: string; description: string; category: string; priority: string;
  status: string; requester_id: string; requester_name: string;
  assigned_to_id?: string | null; assigned_to_name?: string | null;
  business_unit_id?: string | null; created_at: string; updated_at: string;
  replies?: any; attachments?: any;
};

type AnnouncementRow = {
  id: string; title: string; body: string; created_by_user_id: string;
  created_by_name: string; business_unit_id?: string | null;
  target_audience?: string | null; is_pinned: boolean;
  published_at: string; expires_at?: string | null;
};

type KBCategoryRow = { id: string; name: string; icon?: string | null; order: number; };
type KBArticleRow = {
  id: string; category_id: string; title: string; body: string;
  created_at: string; updated_at: string; is_published: boolean;
};

type UserDocumentRow = {
  id: string; employee_id: string; document_type: string;
  custom_document_type?: string | null; file_name: string; file_url: string;
  submitted_at: string; status: string; reviewed_by?: string | null;
  reviewed_at?: string | null; rejection_reason?: string | null;
};

type DeviceBindRow = {
  id: string; user_id: string; device_id: string; device_name: string;
  bound_at: string; is_active: boolean;
};

type ChangeHistoryRow = {
  id: string; employee_id: string; field: string; old_value: string;
  new_value: string; changed_by_user_id: string; changed_at: string;
  status: string; rejection_reason?: string | null;
};

type EmployeeDraftRow = {
  id: string; employee_id: string; changes: any; submitted_at: string;
  status: string; reviewed_by?: string | null; reviewed_at?: string | null;
};

type CalendarEventRow = {
  id: string; title: string; description?: string | null; start_date: string;
  end_date?: string | null; event_type: string; business_unit_id?: string | null;
  created_by_user_id: string;
};

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------
const mapTicket = (r: TicketRow): Ticket => ({
  id: r.id, subject: r.subject, description: r.description,
  category: r.category as any, priority: r.priority as any,
  status: r.status as any, requesterId: r.requester_id, requesterName: r.requester_name,
  assignedToId: r.assigned_to_id || undefined, assignedToName: r.assigned_to_name || undefined,
  businessUnitId: r.business_unit_id || undefined,
  createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at),
  replies: Array.isArray(r.replies) ? r.replies : [],
  attachments: Array.isArray(r.attachments) ? r.attachments : [],
} as any);

const mapAnnouncement = (r: AnnouncementRow): Announcement => ({
  id: r.id, title: r.title, body: r.body,
  createdByUserId: r.created_by_user_id, createdByName: r.created_by_name,
  businessUnitId: r.business_unit_id || undefined,
  targetAudience: r.target_audience as any || undefined,
  isPinned: r.is_pinned,
  publishedAt: new Date(r.published_at),
  expiresAt: r.expires_at ? new Date(r.expires_at) : undefined,
} as any);

const mapKBCategory = (r: KBCategoryRow): KnowledgeBaseCategory => ({
  id: r.id, name: r.name, icon: r.icon || undefined, order: r.order,
} as any);

const mapKBArticle = (r: KBArticleRow): KnowledgeBaseArticle => ({
  id: r.id, categoryId: r.category_id, title: r.title, body: r.body,
  createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at),
  isPublished: r.is_published,
} as any);

const mapUserDocument = (r: UserDocumentRow): UserDocument => ({
  id: r.id, employeeId: r.employee_id, documentType: r.document_type as any,
  customDocumentType: r.custom_document_type || undefined,
  fileName: r.file_name, fileUrl: r.file_url,
  submittedAt: new Date(r.submitted_at), status: r.status as any,
  reviewedBy: r.reviewed_by || undefined,
  reviewedAt: r.reviewed_at ? new Date(r.reviewed_at) : undefined,
  rejectionReason: r.rejection_reason || undefined,
});

const mapDeviceBind = (r: DeviceBindRow): DeviceBind => ({
  id: r.id, userId: r.user_id, deviceId: r.device_id,
  deviceName: r.device_name, boundAt: new Date(r.bound_at), isActive: r.is_active,
} as any);

const mapChangeHistory = (r: ChangeHistoryRow): ChangeHistory => ({
  id: r.id, employeeId: r.employee_id, field: r.field,
  oldValue: r.old_value, newValue: r.new_value,
  changedByUserId: r.changed_by_user_id,
  changedAt: new Date(r.changed_at),
  status: r.status as any,
  rejectionReason: r.rejection_reason || undefined,
} as any);

const mapEmployeeDraft = (r: EmployeeDraftRow): EmployeeDraft => ({
  id: r.id, employeeId: r.employee_id,
  changes: r.changes || {},
  submittedAt: new Date(r.submitted_at),
  status: r.status as any,
  reviewedBy: r.reviewed_by || undefined,
  reviewedAt: r.reviewed_at ? new Date(r.reviewed_at) : undefined,
} as any);

const mapCalendarEvent = (r: CalendarEventRow): CalendarEvent => ({
  id: r.id, title: r.title, description: r.description || undefined,
  startDate: new Date(r.start_date),
  endDate: r.end_date ? new Date(r.end_date) : undefined,
  eventType: r.event_type as any,
  businessUnitId: r.business_unit_id || undefined,
  createdByUserId: r.created_by_user_id,
} as any);

// ---------------------------------------------------------------------------
// Service Methods
// ---------------------------------------------------------------------------

// Tickets
export const fetchTickets = async (): Promise<Ticket[]> => {
  const { data, error } = await supabase.from('tickets').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as TicketRow[]).map(mapTicket);
};

export const saveTicket = async (ticket: Partial<Ticket> & Record<string, any>): Promise<Ticket> => {
  const payload = {
    subject: ticket.subject, description: ticket.description,
    category: ticket.category, priority: ticket.priority, status: ticket.status,
    requester_id: ticket.requesterId, requester_name: ticket.requesterName,
    assigned_to_id: ticket.assignedToId || null, assigned_to_name: ticket.assignedToName || null,
    business_unit_id: ticket.businessUnitId || null,
    replies: ticket.replies || [], attachments: ticket.attachments || [],
  };
  const { data, error } = ticket.id
    ? await supabase.from('tickets').update(payload).eq('id', ticket.id).select().single()
    : await supabase.from('tickets').insert(payload).select().single();
  if (error) throw new Error(error.message);
  return mapTicket(data as TicketRow);
};

// Announcements
export const fetchAnnouncements = async (): Promise<Announcement[]> => {
  const { data, error } = await supabase.from('announcements').select('*').order('published_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as AnnouncementRow[]).map(mapAnnouncement);
};

export const saveAnnouncement = async (ann: Partial<Announcement> & Record<string, any>): Promise<Announcement> => {
  const payload = {
    title: ann.title, body: ann.body,
    created_by_user_id: ann.createdByUserId, created_by_name: ann.createdByName,
    business_unit_id: ann.businessUnitId || null,
    target_audience: ann.targetAudience || null,
    is_pinned: ann.isPinned ?? false,
    expires_at: ann.expiresAt ? new Date(ann.expiresAt).toISOString() : null,
  };
  const { data, error } = ann.id
    ? await supabase.from('announcements').update(payload).eq('id', ann.id).select().single()
    : await supabase.from('announcements').insert(payload).select().single();
  if (error) throw new Error(error.message);
  return mapAnnouncement(data as AnnouncementRow);
};

// Knowledge Base
export const fetchKBCategories = async (): Promise<KnowledgeBaseCategory[]> => {
  const { data, error } = await supabase.from('kb_categories').select('*').order('order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as KBCategoryRow[]).map(mapKBCategory);
};

export const fetchKBArticles = async (): Promise<KnowledgeBaseArticle[]> => {
  const { data, error } = await supabase.from('kb_articles').select('*').order('title', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as KBArticleRow[]).map(mapKBArticle);
};

// User Documents
export const fetchUserDocuments = async (employeeId?: string): Promise<UserDocument[]> => {
  let query = supabase.from('user_documents').select('*').order('submitted_at', { ascending: false });
  if (employeeId) query = query.eq('employee_id', employeeId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as UserDocumentRow[]).map(mapUserDocument);
};

// Device Binds
export const fetchDeviceBinds = async (userId?: string): Promise<DeviceBind[]> => {
  let query = supabase.from('device_binds').select('*').order('bound_at', { ascending: false });
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as DeviceBindRow[]).map(mapDeviceBind);
};

// Change History
export const fetchChangeHistory = async (employeeId?: string): Promise<ChangeHistory[]> => {
  let query = supabase.from('change_history').select('*').order('changed_at', { ascending: false });
  if (employeeId) query = query.eq('employee_id', employeeId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as ChangeHistoryRow[]).map(mapChangeHistory);
};

// Employee Drafts
export const fetchEmployeeDrafts = async (): Promise<EmployeeDraft[]> => {
  const { data, error } = await supabase.from('employee_drafts').select('*').order('submitted_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as EmployeeDraftRow[]).map(mapEmployeeDraft);
};

// Calendar Events
export const fetchCalendarEvents = async (): Promise<CalendarEvent[]> => {
  const { data, error } = await supabase.from('calendar_events').select('*').order('start_date', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as CalendarEventRow[]).map(mapCalendarEvent);
};
