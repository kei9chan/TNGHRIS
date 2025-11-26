// services/auditService.ts
// FIX: Imported the correct AuditAction type from types.ts and removed the local, incomplete version.
import { AuditLog as AuditLogType, User, AuditAction } from '../types';
import { mockAuditLogs } from './mockData';

export const logActivity = (
    user: User | null,
    action: AuditAction,
    entity: string,
    entityId: string,
    details: string
) => {
    if (!user) {
        console.warn("Attempted to log activity without a user session.");
        return;
    }

    const newLogEntry: AuditLogType = {
        id: `log-${Date.now()}`,
        timestamp: new Date(),
        userId: user.id,
        userEmail: user.email,
        // FIX: Removed unnecessary `as any` cast as the action type is now correctly imported.
        action: action,
        entity,
        entityId,
        details,
    };

    // Prepend to the beginning of the array
    mockAuditLogs.unshift(newLogEntry);
};