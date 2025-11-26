
import { User, AuditLog, AuditAction, Role, EmployeeDraft, EmployeeDraftStatus } from '../types';
import { mockUsers, mockAuditLogs, mockEmployeeDrafts } from './mockData';

/**
 * Database Service (Simulated Backend Middleware)
 * 
 * In a real application, this logic resides in the Backend API/Database Triggers.
 * This service ensures that NO data modification happens without a corresponding
 * Audit Log entry, satisfying the "Audit Trail Reliability" requirement.
 */

class UserRepo {
    private _log(actor: User, action: AuditAction, entityId: string, details: string) {
        const newLog: AuditLog = {
            id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            timestamp: new Date(),
            userId: actor.id,
            userEmail: actor.email,
            action,
            entity: 'User',
            entityId,
            details
        };
        // "Append Only" - we unshift to show newest first in UI, but conceptually it's appending
        mockAuditLogs.unshift(newLog);
    }

    /**
     * Create a new user and log the action.
     */
    create(actor: User, newUser: User): User {
        mockUsers.push(newUser);
        this._log(actor, 'CREATE', newUser.id, `Created new user: ${newUser.name} (${newUser.email})`);
        return newUser;
    }

    /**
     * Update an existing user and log the action.
     * Detects changes to log specific fields.
     */
    update(actor: User, userId: string, updates: Partial<User>): User | null {
        const index = mockUsers.findIndex(u => u.id === userId);
        if (index === -1) return null;

        const oldUser = mockUsers[index];
        const updatedUser = { ...oldUser, ...updates };
        
        // Identify what changed for the audit log
        const changes: string[] = [];
        (Object.keys(updates) as Array<keyof User>).forEach(key => {
            if (JSON.stringify(oldUser[key]) !== JSON.stringify(updates[key])) {
                changes.push(key);
            }
        });

        if (changes.length > 0) {
            mockUsers[index] = updatedUser;
            this._log(actor, 'UPDATE', userId, `Updated fields: ${changes.join(', ')}`);
        }

        return updatedUser;
    }

    /**
     * Soft delete or deactivate a user.
     */
    deactivate(actor: User, userId: string): boolean {
        const index = mockUsers.findIndex(u => u.id === userId);
        if (index === -1) return false;

        mockUsers[index].status = 'Inactive';
        this._log(actor, 'UPDATE', userId, `Deactivated user account.`);
        return true;
    }
}

class DraftRepo {
     private _log(actor: User, action: AuditAction, entityId: string, details: string) {
        const newLog: AuditLog = {
            id: `log-${Date.now()}`,
            timestamp: new Date(),
            userId: actor.id,
            userEmail: actor.email,
            action,
            entity: 'EmployeeDraft',
            entityId,
            details
        };
        mockAuditLogs.unshift(newLog);
    }

    createOrUpdate(actor: User, employeeId: string, draftData: Partial<User>, status: EmployeeDraftStatus, submissionId?: string) {
        const existingIndex = mockEmployeeDrafts.findIndex(d => d.employeeId === employeeId && d.status !== EmployeeDraftStatus.Approved);
        
        if (existingIndex > -1) {
            // Update
            const draft = mockEmployeeDrafts[existingIndex];
            mockEmployeeDrafts[existingIndex] = {
                ...draft,
                draftData: { ...draft.draftData, ...draftData },
                status,
                submissionId: submissionId || draft.submissionId
            };
            this._log(actor, 'UPDATE', draft.id, `Updated profile draft. Status: ${status}`);
        } else {
            // Create
            const newDraft: EmployeeDraft = {
                id: `draft-${employeeId}-${Date.now()}`,
                employeeId,
                draftData,
                status,
                createdAt: new Date(),
                submissionId
            };
            mockEmployeeDrafts.push(newDraft);
             this._log(actor, 'CREATE', newDraft.id, `Created profile draft. Status: ${status}`);
        }
    }
}

export const db = {
    users: new UserRepo(),
    drafts: new DraftRepo(),
};
