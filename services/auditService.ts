// services/auditService.ts
import { supabase } from './supabaseClient';
import { AuditLog as AuditLogType, User, AuditAction } from '../types';

export const logActivity = async (
    user: User | null,
    action: AuditAction,
    entity: string,
    entityId: string,
    details: string
): Promise<void> => {
    if (!user) {
        console.warn("Attempted to log activity without a user session.");
        return;
    }

    const payload = {
        user_id: user.id,
        user_email: user.email,
        action,
        entity,
        entity_id: entityId,
        details,
    };

    const { error } = await supabase.from('audit_logs').insert(payload);
    if (error) {
        console.error('Failed to write audit log:', error.message);
    }
};

export const fetchAuditLogs = async (): Promise<AuditLogType[]> => {
    const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

    if (error) throw new Error(error.message || 'Failed to fetch audit logs');
    return (data || []).map((row: any) => ({
        id: row.id,
        timestamp: new Date(row.created_at),
        userId: row.user_id,
        userEmail: row.user_email,
        action: row.action as AuditAction,
        entity: row.entity,
        entityId: row.entity_id,
        details: row.details,
    }));
};