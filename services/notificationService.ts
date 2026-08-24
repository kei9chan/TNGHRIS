import { supabase } from './supabaseClient';
import { Notification, NotificationType } from '../types';
import { resolveCurrentHrisUserId } from './evaluationService';
import { ApprovalRequestKind, getApprovalReviewUrl } from './approvalDeepLinks';

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
  dedupe_key?: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------
const canonicalApprovalLink = (row: NotificationRow) => {
  const title = String(row.title || '').toLowerCase();
  const linkedType = row.link?.match(/[?&]type=([^&#]+)/)?.[1]?.toLowerCase();
  let kind: ApprovalRequestKind | undefined;
  if (linkedType === 'nte' || title.includes('nte approval')) kind = 'nte';
  else if (linkedType === 'pan' || title.includes('pan approval')) kind = 'pan';
  else if (linkedType === 'overtime' || (title.includes('ot request pending') && title.includes('approval'))) kind = 'overtime';
  else if (linkedType === 'wfh' || (title.includes('wfh request pending') && title.includes('approval'))) kind = 'wfh';
  else if (linkedType === 'leave' || (title.includes('leave request pending') && title.includes('approval'))) kind = 'leave';
  else if (linkedType === 'manpower' || (title.includes('manpower') && title.includes('approval'))) kind = 'manpower';
  else if (linkedType === 'requisition' || (title.includes('requisition') && title.includes('approval'))) kind = 'requisition';
  else if (linkedType === 'award' || (title.includes('award') && title.includes('approval'))) kind = 'award';

  const linkedItem = row.link?.match(/[?&]item=([^&#]+)/)?.[1];
  const requestId = row.related_entity_id || (linkedItem ? decodeURIComponent(linkedItem) : undefined);
  if (kind && requestId) return getApprovalReviewUrl(kind, requestId);
  return row.link || undefined;
};

const mapNotification = (row: NotificationRow): Notification => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  message: row.message,
  type: row.type as Notification['type'],
  isRead: row.is_read,
  link: canonicalApprovalLink(row) || '',
  relatedEntityId: row.related_entity_id || undefined,
  dedupeKey: row.dedupe_key || undefined,
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

/**
 * Resolve workflow notifications before marking them read. Evaluation links
 * are checked against the live record and the current user's saved evaluator
 * assignment so a stale or inaccessible target never becomes a read dead-end.
 */
export const resolveNotificationDestination = async (notification: Notification): Promise<string> => {
  if (notification.type !== NotificationType.EVALUATION_ASSIGNED) {
    return notification.link || '/notifications';
  }

  const evaluationId = notification.relatedEntityId
    || notification.link?.match(/\/evaluation\/(?:perform|report)\/([^/?#]+)/)?.[1];
  if (!evaluationId) return '/evaluation/reviews';

  const currentUserId = await resolveCurrentHrisUserId(notification.userId);
  const [evaluationResult, assignmentResult, profileResult] = await Promise.all([
    supabase
      .from('evaluations')
      .select('id, status, is_employee_visible')
      .eq('id', evaluationId)
      .maybeSingle(),
    supabase
      .from('evaluation_evaluators')
      .select('type, user_id, business_unit_id, department_id')
      .eq('evaluation_id', evaluationId),
    supabase
      .from('hris_users')
      .select('id, business_unit_id, department_id')
      .eq('id', currentUserId)
      .maybeSingle(),
  ]);

  if (evaluationResult.error) throw new Error(evaluationResult.error.message);
  if (assignmentResult.error) throw new Error(assignmentResult.error.message);
  if (profileResult.error) throw new Error(profileResult.error.message);
  if (!evaluationResult.data) {
    throw new Error('This evaluation is no longer available or is not assigned to your account.');
  }

  const profile = profileResult.data;
  const isAssignedEvaluator = (assignmentResult.data || []).some((assignment: any) => {
    if (String(assignment.type || '').toLowerCase() === 'individual') {
      return assignment.user_id === currentUserId;
    }
    if (String(assignment.type || '').toLowerCase() !== 'group' || !profile) return false;
    const matchesBusinessUnit = !assignment.business_unit_id
      || assignment.business_unit_id === profile.business_unit_id;
    const matchesDepartment = !assignment.department_id
      || assignment.department_id === profile.department_id;
    return matchesBusinessUnit && matchesDepartment;
  });

  const status = String(evaluationResult.data.status || '').toLowerCase();
  if (status === 'completed' && (isAssignedEvaluator || evaluationResult.data.is_employee_visible)) {
    return `/evaluation/report/${evaluationId}`;
  }
  if (status !== 'inprogress') {
    throw new Error(`This evaluation is ${evaluationResult.data.status || 'unavailable'} and can no longer be completed.`);
  }
  if (isAssignedEvaluator) return `/evaluation/perform/${evaluationId}`;
  return '/evaluation/reviews';
};

export const createNotification = async (notif: Partial<Notification>): Promise<Notification> => {
  const payload: Record<string, unknown> = {
    user_id: notif.userId,
    title: notif.title || '',
    message: notif.message || '',
    type: notif.type || 'info',
    is_read: false,
    link: notif.link || null,
    dedupe_key: notif.dedupeKey || null,
  };

  // Persist related entity id when provided (used for deep-linking from notification center)
  if (notif.relatedEntityId) {
    payload.related_entity_id = notif.relatedEntityId;
  }

  let { error } = await supabase.from('notifications').insert(payload);
  // Keep deployments safe if the frontend reaches production shortly before
  // the additive dedupe migration. The notification still sends once the
  // legacy payload is accepted; the migration enables retry protection.
  if (error && notif.dedupeKey && (error.code === 'PGRST204' || error.code === '42703')) {
    delete payload.dedupe_key;
    ({ error } = await supabase.from('notifications').insert(payload));
  }
  if (error && !(notif.dedupeKey && error.code === '23505')) throw new Error(error.message || 'Failed to create notification');
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
    dedupeKey: payload.dedupe_key ? String(payload.dedupe_key) : undefined,
    createdAt: new Date(),
  };
};
