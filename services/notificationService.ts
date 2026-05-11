import { supabase } from './supabaseClient';
import { Notification } from '../types';

// ---------------------------------------------------------------------------
// Row Type
// ---------------------------------------------------------------------------
type NotificationRow = {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  link?: string | null;
  related_entity_id?: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------
const mapNotification = (row: NotificationRow): Notification => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  message: row.message,
  type: row.type as Notification['type'],
  isRead: row.is_read,
  link: row.link || undefined,
  relatedEntityId: row.related_entity_id || undefined,
  createdAt: new Date(row.created_at),
});

// ---------------------------------------------------------------------------
// Service Methods
// ---------------------------------------------------------------------------

export const fetchNotifications = async (userId: string): Promise<Notification[]> => {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message || 'Failed to fetch notifications');
  return (data as NotificationRow[]).map(mapNotification);
};

export const markNotificationRead = async (id: string): Promise<void> => {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  if (error) throw new Error(error.message || 'Failed to mark notification as read');
};

export const markAllNotificationsRead = async (userId: string): Promise<void> => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);
  if (error) throw new Error(error.message || 'Failed to mark all notifications as read');
};

export const createNotification = async (notif: Partial<Notification>): Promise<Notification> => {
  const payload: Record<string, unknown> = {
    user_id: notif.userId,
    title: notif.title || '',
    message: notif.message || '',
    type: notif.type || 'info',
    is_read: false,
    link: notif.link || null,
  };

  // Persist related entity id when provided (used for deep-linking from notification center)
  if (notif.relatedEntityId) {
    payload.related_entity_id = notif.relatedEntityId;
  }

  const { error } = await supabase.from('notifications').insert(payload);
  if (error) throw new Error(error.message || 'Failed to create notification');
  // Return a synthetic notification object — we can't .select() back because
  // the SELECT RLS policy restricts reading to the notification's owner.
  return {
    id: crypto.randomUUID?.() || '',
    userId: String(payload.user_id),
    title: String(payload.title),
    message: String(payload.message),
    type: (payload.type || 'info') as Notification['type'],
    isRead: false,
    link: payload.link ? String(payload.link) : undefined,
    relatedEntityId: payload.related_entity_id ? String(payload.related_entity_id) : undefined,
    createdAt: new Date(),
  };
};
