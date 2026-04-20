import { User, AuditAction, EmployeeDraft, EmployeeDraftStatus } from '../types';
import { supabase } from './supabaseClient';

/**
 * Database Service (Supabase Backend)
 * 
 * Handles user CRUD and draft operations against the live Supabase database,
 * with corresponding audit log entries for every mutation.
 */

const writeAuditLog = async (actor: User, action: AuditAction, entity: string, entityId: string, details: string) => {
    const { error } = await supabase.from('audit_logs').insert({
        user_id: actor.id,
        user_email: actor.email,
        action,
        entity,
        entity_id: entityId,
        details,
    });
    if (error) console.error('Audit log write failed:', error.message);
};

class UserRepo {
    async create(actor: User, newUser: Partial<User>): Promise<User | null> {
        const payload: Record<string, unknown> = {
            email: newUser.email,
            first_name: newUser.name?.split(' ')[0] || '',
            last_name: newUser.name?.split(' ').slice(1).join(' ') || '',
            full_name: newUser.name || '',
            role: newUser.role || 'Employee',
            status: 'Active',
            is_photo_enrolled: false,
            business_unit: newUser.businessUnit || null,
            business_unit_id: newUser.businessUnitId || null,
            department: newUser.department || null,
            department_id: newUser.departmentId || null,
            position: newUser.position || null,
        };

        const { data, error } = await supabase.from('hris_users').insert(payload).select().single();
        if (error) { console.error('Create user failed:', error.message); return null; }

        await writeAuditLog(actor, 'CREATE', 'User', data.id, `Created new user: ${newUser.name} (${newUser.email})`);
        return data as unknown as User;
    }

    async update(actor: User, userId: string, updates: Partial<User>): Promise<boolean> {
        const payload: Record<string, unknown> = {};
        if (updates.name !== undefined) payload.full_name = updates.name;
        if (updates.email !== undefined) payload.email = updates.email;
        if (updates.role !== undefined) payload.role = updates.role;
        if (updates.status !== undefined) payload.status = updates.status;
        if (updates.department !== undefined) payload.department = updates.department;
        if (updates.businessUnit !== undefined) payload.business_unit = updates.businessUnit;
        if (updates.position !== undefined) payload.position = updates.position;

        if (Object.keys(payload).length === 0) return true;

        const { error } = await supabase.from('hris_users').update(payload).eq('id', userId);
        if (error) { console.error('Update user failed:', error.message); return false; }

        await writeAuditLog(actor, 'UPDATE', 'User', userId, `Updated fields: ${Object.keys(payload).join(', ')}`);
        return true;
    }

    async deactivate(actor: User, userId: string): Promise<boolean> {
        const { error } = await supabase.from('hris_users').update({ status: 'Inactive' }).eq('id', userId);
        if (error) { console.error('Deactivate user failed:', error.message); return false; }

        await writeAuditLog(actor, 'UPDATE', 'User', userId, 'Deactivated user account.');
        return true;
    }
}

class DraftRepo {
    async createOrUpdate(actor: User, employeeId: string, draftData: Partial<User>, status: EmployeeDraftStatus, submissionId?: string) {
        // Check for existing pending draft
        const { data: existing } = await supabase
            .from('employee_drafts')
            .select('id')
            .eq('employee_id', employeeId)
            .neq('status', EmployeeDraftStatus.Approved)
            .limit(1);

        if (existing && existing.length > 0) {
            // Update existing draft
            const { error } = await supabase.from('employee_drafts').update({
                draft_data: draftData,
                status,
                submission_id: submissionId || null,
            }).eq('id', existing[0].id);

            if (error) { console.error('Update draft failed:', error.message); return; }
            await writeAuditLog(actor, 'UPDATE', 'EmployeeDraft', existing[0].id, `Updated profile draft. Status: ${status}`);
        } else {
            // Create new draft
            const { data, error } = await supabase.from('employee_drafts').insert({
                employee_id: employeeId,
                draft_data: draftData,
                status,
                submission_id: submissionId || null,
            }).select('id').single();

            if (error) { console.error('Create draft failed:', error.message); return; }
            await writeAuditLog(actor, 'CREATE', 'EmployeeDraft', data?.id || '', `Created profile draft. Status: ${status}`);
        }
    }
}

export const db = {
    users: new UserRepo(),
    drafts: new DraftRepo(),
};
