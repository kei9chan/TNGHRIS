import { supabase } from './supabaseClient';
import { Ticket, TicketStatus, TicketPriority, TicketCategory, ChatMessage } from '../types';

type TicketRow = {
  id: string;
  requester_id: string;
  requester_name: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  created_at?: string;
  assigned_to_id?: string | null;
  assigned_to_name?: string | null;
  assigned_at?: string | null;
  resolved_at?: string | null;
  sla_deadline?: string | null;
  chat_thread?: any;
  attachments?: string[] | null;
  business_unit_id?: string | null;
  business_unit_name?: string | null;
};

const mapRow = (row: TicketRow): Ticket => ({
  id: row.id,
  requesterId: row.requester_id,
  requesterName: row.requester_name,
  description: row.description,
  category: row.category as TicketCategory,
  priority: row.priority as TicketPriority,
  status: row.status as TicketStatus,
  createdAt: row.created_at ? new Date(row.created_at) : new Date(),
  assignedToId: row.assigned_to_id || undefined,
  assignedToName: row.assigned_to_name || undefined,
  assignedAt: row.assigned_at ? new Date(row.assigned_at) : undefined,
  resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
  slaDeadline: row.sla_deadline ? new Date(row.sla_deadline) : undefined,
  chatThread: (row.chat_thread as ChatMessage[]) || [],
  attachments: row.attachments || undefined,
  businessUnitId: row.business_unit_id || undefined,
  businessUnitName: row.business_unit_name || undefined,
});

const isUuid = (value?: string | null) =>
  !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export const fetchTickets = async (): Promise<Ticket[]> => {
  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message || 'Failed to load tickets');
  return (data as TicketRow[]).map(mapRow);
};

export const fetchTicketById = async (id: string): Promise<Ticket | null> => {
  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message || 'Failed to load ticket');
  return data ? mapRow(data as TicketRow) : null;
};

export const saveTicket = async (ticket: Partial<Ticket>): Promise<Ticket> => {
  // Resolve business unit from requester if not provided or not a UUID
  let requesterBuId = ticket.businessUnitId || null;
  let requesterBuName = ticket.businessUnitName || undefined;

  if (ticket.requesterId) {
    const { data: requesterRow } = await supabase
      .from('hris_users')
      .select('business_unit_id, business_unit')
      .eq('id', ticket.requesterId)
      .maybeSingle();

    requesterBuId = requesterBuId || requesterRow?.business_unit_id || null;
    requesterBuName = requesterBuName || requesterRow?.business_unit || undefined;
  }

  if (!isUuid(requesterBuId) && requesterBuName) {
    const { data: buRow } = await supabase
      .from('business_units')
      .select('id, name')
      .ilike('name', requesterBuName)
      .maybeSingle();
    if (buRow?.id) {
      requesterBuId = buRow.id;
      requesterBuName = buRow.name;
    }
  }

  const payload: Partial<TicketRow> = {
    requester_id: ticket.requesterId,
    requester_name: ticket.requesterName,
    description: ticket.description || '',
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status || TicketStatus.New,
    assigned_to_id: ticket.assignedToId || null,
    assigned_to_name: ticket.assignedToName || null,
    assigned_at: ticket.assignedAt ? ticket.assignedAt.toISOString() : null,
    resolved_at: ticket.resolvedAt ? ticket.resolvedAt.toISOString() : null,
    sla_deadline: ticket.slaDeadline ? ticket.slaDeadline.toISOString() : null,
    chat_thread: ticket.chatThread || [],
    attachments: ticket.attachments || [],
    business_unit_id: isUuid(requesterBuId) ? requesterBuId : null,
    business_unit_name: requesterBuName || null,
  };

  const query = ticket.id
    ? supabase.from('tickets').update(payload).eq('id', ticket.id).select().single()
    : supabase.from('tickets').insert(payload).select().single();

  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Failed to save ticket');
  return mapRow(data as TicketRow);
};
