import { supabase } from './supabaseClient';
import { Announcement, AnnouncementType } from '../types';

type AnnouncementRow = {
  id: string;
  title: string;
  message: string;
  type: AnnouncementType;
  target_group: string;
  business_unit_id: string | null;
  attachment_url: string | null;
  acknowledgement_user_ids: string[] | null;
  created_by_user_id: string | null;
  created_by_name: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const mapRow = (row: AnnouncementRow): Announcement => ({
  id: row.id,
  title: row.title,
  message: row.message,
  type: row.type,
  targetGroup: row.target_group,
  businessUnitId: row.business_unit_id || undefined,
  attachmentUrl: row.attachment_url || undefined,
  acknowledgementIds: row.acknowledgement_user_ids || [],
  createdBy: row.created_by_name || '',
  createdAt: row.created_at ? new Date(row.created_at) : new Date(),
});

export const fetchAnnouncements = async (): Promise<Announcement[]> => {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message || 'Failed to load announcements');
  return (data as AnnouncementRow[]).map(mapRow);
};

export const saveAnnouncement = async (
  announcement: Partial<Announcement>,
  user?: { id?: string; name?: string }
): Promise<Announcement> => {
  const payload: Partial<AnnouncementRow> = {
    title: announcement.title,
    message: announcement.message,
    type: announcement.type || AnnouncementType.General,
    target_group: announcement.targetGroup || 'All',
    business_unit_id: announcement.businessUnitId || null,
    attachment_url: announcement.attachmentUrl || null,
    acknowledgement_user_ids: announcement.acknowledgementIds || [],
    created_by_user_id: user?.id || null,
    created_by_name: announcement.createdBy || user?.name || null,
    updated_at: new Date().toISOString(),
  };

  const query = announcement.id
    ? supabase.from('announcements').update(payload).eq('id', announcement.id).select().single()
    : supabase
        .from('announcements')
        .insert({ ...payload, created_at: new Date().toISOString() })
        .select()
        .single();

  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Failed to save announcement');
  return mapRow(data as AnnouncementRow);
};

export const acknowledgeAnnouncement = async (
  announcementId: string,
  userId: string,
  currentAcks: string[]
): Promise<void> => {
  const newAcks = Array.from(new Set([...(currentAcks || []), userId]));
  const { error } = await supabase
    .from('announcements')
    .update({ acknowledgement_user_ids: newAcks, updated_at: new Date().toISOString() })
    .eq('id', announcementId);
  if (error) throw new Error(error.message || 'Failed to acknowledge announcement');
};

export const getSignedAnnouncementUrl = async (path?: string): Promise<string | null> => {
  if (!path) return null;

  // If we were given a full URL, try to extract the storage path after the bucket name.
  let storagePath = path;
  if (path.startsWith('http')) {
    const marker = '/announcements_attachments/';
    const idx = path.indexOf(marker);
    if (idx !== -1) {
      storagePath = path.substring(idx + marker.length);
    } else {
      // If we can't parse, fall back to the original URL (may already be public)
      return path;
    }
  }

  const { data, error } = await supabase.storage
    .from('announcements_attachments')
    .createSignedUrl(storagePath, 60 * 60 * 24); // 24 hours
  if (error || !data?.signedUrl) {
    console.warn('Failed to sign announcement attachment', error);
    return null;
  }
  return data.signedUrl;
};
