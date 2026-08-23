import React, { useEffect, useMemo, useState } from 'react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { Role, Permission, Resource, PermissionsMatrix } from '../../types';
import PermissionsMatrixTable from '../../components/admin/PermissionsMatrix';
import { usePermissions } from '../../hooks/usePermissions';
import { supabase } from '../../services/supabaseClient';
import { usePermissionsContext } from '../../context/PermissionsContext';

type RoleRow = {
    id: Role;
    display_name?: string | null;
    description?: string | null;
    dashboard_type?: string | null;
    default_data_scope?: string | null;
};

type AuthorityMatrix = Record<string, Record<string, Permission[]>>;
const dataScopes = ['SELF','DIRECT_REPORTS','DEPARTMENT','HOME_ONLY','SPECIFIC','GLOBAL'];

const sensitiveFields = [
    'salary_compensation','bank_information','sss','tin','pagibig','philhealth',
    'employee_documents','benefits_medical','disciplinary_records','ntes',
    'investigation_evidence','evaluation_results','payroll_staging','final_pay',
    'security_pins','authentication_fields',
];
const workflowKeys = [
    'Leave','Overtime','WFH','Manpower','JobRequisitions','PersonnelActionNotices',
    'IncidentReports','NTEs','DisciplinaryDecisions','Benefits','COE','AssetRequests',
    'PayrollPreparation','FinalPay','Evaluations','Awards','RecruitmentOffers','Resignation','Clearance',
];
const sensitiveActions = [Permission.View,Permission.Edit,Permission.Download,Permission.Export];
const workflowActions = [Permission.Submit,Permission.Review,Permission.Approve,Permission.Reject,Permission.Return,Permission.Cancel,Permission.Finalize];

const RolesPermissions: React.FC = () => {
    const { refreshPermissions } = usePermissionsContext();
    const { can } = usePermissions();
    const canView = can('RolesPermissions', Permission.View);
    const canManage = can('RolesPermissions', Permission.Manage);
    const [permissions, setPermissions] = useState<PermissionsMatrix>({});
    const [sensitiveMatrix, setSensitiveMatrix] = useState<AuthorityMatrix>({});
    const [workflowMatrix, setWorkflowMatrix] = useState<AuthorityMatrix>({});
    const [authorityRole, setAuthorityRole] = useState<Role>(Role.Admin);
    const [auditRows, setAuditRows] = useState<any[]>([]);
    const [roles, setRoles] = useState<RoleRow[]>([]);
    const [resources, setResources] = useState<Array<{ id: Resource; group_name?: string | null }>>([]);
    const [dirtyRoles, setDirtyRoles] = useState<Set<Role>>(new Set());
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const resourceGroups = useMemo(() => {
        const groups: Record<string, Resource[]> = {};
        resources.forEach(resource => {
            const group = resource.group_name || 'General';
            (groups[group] ||= []).push(resource.id);
        });
        return groups;
    }, [resources]);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        const [roleResult, resourceResult, permissionResult, sensitiveResult, workflowResult, auditResult] = await Promise.all([
            supabase.from('roles')
                .select('id, display_name, description, dashboard_type, default_data_scope')
                .eq('is_active', true).order('display_name'),
            supabase.from('resources').select('id, group_name').eq('is_active', true).order('group_name').order('id'),
            supabase.from('role_permissions').select('role_id, resource_id, permissions'),
            supabase.from('role_sensitive_permissions').select('role_id, field_key, permissions'),
            supabase.from('role_workflow_permissions').select('role_id, workflow_key, actions'),
            supabase.from('rbac_audit_log').select('id,action,entity_type,entity_id,created_at,actor_user_id').order('created_at',{ ascending:false }).limit(20),
        ]);
        const loadError = roleResult.error || resourceResult.error || permissionResult.error || sensitiveResult.error || workflowResult.error || auditResult.error;
        if (loadError) {
            setError(loadError.message);
            setLoading(false);
            return;
        }
        setRoles((roleResult.data || []) as RoleRow[]);
        setResources((resourceResult.data || []) as Array<{ id: Resource; group_name?: string | null }>);
        const matrix: PermissionsMatrix = {};
        (permissionResult.data || []).forEach((row: any) => {
            if (!matrix[row.role_id as Role]) matrix[row.role_id as Role] = {};
            (matrix[row.role_id as Role] as any)[row.resource_id] = row.permissions || [];
        });
        setPermissions(matrix);
        const nextSensitive: AuthorityMatrix = {};
        (sensitiveResult.data || []).forEach((row: any) => { (nextSensitive[row.role_id] ||= {})[row.field_key] = row.permissions || []; });
        const nextWorkflows: AuthorityMatrix = {};
        (workflowResult.data || []).forEach((row: any) => { (nextWorkflows[row.role_id] ||= {})[row.workflow_key] = row.actions || []; });
        setSensitiveMatrix(nextSensitive);
        setWorkflowMatrix(nextWorkflows);
        setAuditRows(auditResult.data || []);
        setDirtyRoles(new Set());
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    useEffect(() => {
        if (dirtyRoles.size === 0) return;
        const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirtyRoles.size]);

    const markLinkedDirty = (role: Role) => setDirtyRoles(previous => {
        const next = new Set(previous); next.add(role);
        if (role === Role.BOD) next.add(Role.HRManager);
        if (role === Role.HRManager) next.add(Role.BOD);
        return next;
    });

    const updateDefaultScope = (role: Role, scope: string) => {
        const linked = role === Role.BOD || role === Role.HRManager ? [Role.BOD, Role.HRManager] : [role];
        setRoles(previous => previous.map(item => linked.includes(item.id) ? { ...item, default_data_scope: scope } : item));
        markLinkedDirty(role);
    };

    const toggleAuthority = (kind: 'sensitive'|'workflow', role: Role, key: string, action: Permission, checked: boolean) => {
        const rolesToUpdate = role === Role.BOD || role === Role.HRManager ? [Role.BOD,Role.HRManager] : [role];
        const setter = kind === 'sensitive' ? setSensitiveMatrix : setWorkflowMatrix;
        setter(previous => {
            const next: AuthorityMatrix = JSON.parse(JSON.stringify(previous));
            rolesToUpdate.forEach(target => {
                const current = next[target]?.[key] || [];
                (next[target] ||= {})[key] = checked ? [...new Set([...current,action])] : current.filter(item => item !== action);
            });
            return next;
        });
        markLinkedDirty(role);
    };

    const handlePermissionChange = (role: Role, resource: Resource, permission: Permission, checked: boolean) => {
        const linkedRoles = role === Role.BOD || role === Role.HRManager
            ? [Role.BOD, Role.HRManager]
            : [role];
        setPermissions(previous => {
            const next: PermissionsMatrix = JSON.parse(JSON.stringify(previous));
            linkedRoles.forEach(targetRole => {
                const current = (next[targetRole]?.[resource] || []) as Permission[];
                let updated = checked
                    ? [...new Set([...current, permission])]
                    : current.filter(value => value !== permission);
                if (checked && permission !== Permission.View) updated = [...new Set([...updated, Permission.View])];
                if (!checked && permission === Permission.View) updated = [];
                if (!next[targetRole]) next[targetRole] = {};
                (next[targetRole] as Partial<Record<Resource, Permission[]>>)[resource] = updated;
            });
            return next;
        });
        setDirtyRoles(previous => {
            const next = new Set(previous);
            linkedRoles.forEach(roleId => next.add(roleId));
            return next;
        });
    };

    const handleSave = async () => {
        setSaving(true);
        setSaved(false);
        setError(null);
        const rolesToSave = Array.from(dirtyRoles).filter(role =>
            !(role === Role.HRManager && dirtyRoles.has(Role.BOD))
        );
        for (const role of rolesToSave) {
            const { error: saveError } = await supabase.rpc('admin_replace_role_permissions', {
                p_role: role,
                p_matrix: permissions[role] || {},
            });
            if (saveError) {
                setError(saveError.message);
                setSaving(false);
                return;
            }
            const { error: authorityError } = await supabase.rpc('admin_replace_role_authority', {
                p_role: role,
                p_sensitive_matrix: sensitiveMatrix[role] || {},
                p_workflow_matrix: workflowMatrix[role] || {},
            });
            if (authorityError) {
                setError(authorityError.message);
                setSaving(false);
                return;
            }
            const { error: configurationError } = await supabase.rpc('admin_update_role_default_scope', {
                p_role: role,
                p_default_data_scope: roles.find(item => item.id === role)?.default_data_scope || 'SELF',
            });
            if (configurationError) {
                setError(configurationError.message);
                setSaving(false);
                return;
            }
        }
        await refreshPermissions();
        await loadData();
        setSaving(false);
        setSaved(true);
        window.setTimeout(() => setSaved(false), 3000);
    };

    if (!canView) return <Card><div className="p-6 text-center">You do not have permission to view Roles &amp; Permissions.</div></Card>;

    return (
        <div className="space-y-6">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Roles &amp; Permissions</h1>
                    <p className="mt-1 text-sm text-gray-500">Feature, scope, sensitive-data, workflow, and dashboard authority are resolved by Supabase.</p>
                </div>
                {canManage && (
                    <Button onClick={handleSave} isLoading={saving} disabled={saving || dirtyRoles.size === 0}>
                        {saving ? 'Saving…' : saved ? 'Saved' : 'Save Changes'}
                    </Button>
                )}
            </header>

            {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Board of Director and HR Manager are linked authorities. Any feature change to either role is mirrored and parity-validated before commit.
            </div>

            <Card title="Approved active roles">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {roles.map(role => (
                        <div key={role.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-slate-900/50">
                            <h2 className="font-semibold text-gray-900 dark:text-white">{role.display_name || role.id}</h2>
                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{role.description}</p>
                            <p className="mt-2 text-xs text-gray-500">Dashboard: {role.dashboard_type}</p>
                            <label className="mt-3 block text-xs font-medium text-gray-600">Default data scope
                                <select value={role.default_data_scope || 'SELF'} disabled={!canManage} onChange={event => updateDefaultScope(role.id, event.target.value)} className="mt-1 block w-full rounded-md border-gray-300 bg-white p-2 text-sm disabled:bg-gray-100">
                                    {dataScopes.map(scope => <option key={scope} value={scope}>{scope.replaceAll('_',' ')}</option>)}
                                </select>
                            </label>
                        </div>
                    ))}
                </div>
            </Card>

            <Card title="Feature permission matrix">
                {loading ? <div className="p-8 text-center text-gray-500">Loading centralized permissions…</div> : (
                    <PermissionsMatrixTable
                        roles={roles.map(role => role.id)}
                        resourceGroups={resourceGroups}
                        permissionsMatrix={permissions}
                        onPermissionChange={canManage ? handlePermissionChange : undefined}
                    />
                )}
            </Card>

            <Card title="Sensitive-data and workflow authority">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-gray-600">These controls are independent from feature visibility and data scope.</p>
                    <select value={authorityRole} onChange={event => setAuthorityRole(event.target.value as Role)} className="rounded-md border-gray-300 p-2 text-sm">
                        {roles.map(role => <option key={role.id} value={role.id}>{role.display_name || role.id}</option>)}
                    </select>
                </div>
                <div className="grid gap-6 xl:grid-cols-2">
                    <div>
                        <h3 className="mb-2 font-semibold">Sensitive-field permissions</h3>
                        <div className="max-h-[34rem] overflow-auto rounded-lg border">
                            {sensitiveFields.map(field => <div key={field} className="flex flex-col gap-2 border-b p-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
                                <span className="text-sm font-medium">{field.replaceAll('_',' ')}</span>
                                <div className="flex flex-wrap gap-3">{sensitiveActions.map(action => <label key={action} className="flex items-center gap-1 text-xs"><input type="checkbox" disabled={!canManage} checked={sensitiveMatrix[authorityRole]?.[field]?.includes(action) || false} onChange={event => toggleAuthority('sensitive',authorityRole,field,action,event.target.checked)} />{action}</label>)}</div>
                            </div>)}
                        </div>
                    </div>
                    <div>
                        <h3 className="mb-2 font-semibold">Workflow actions</h3>
                        <div className="max-h-[34rem] overflow-auto rounded-lg border">
                            {workflowKeys.map(workflow => <div key={workflow} className="flex flex-col gap-2 border-b p-3 last:border-b-0">
                                <span className="text-sm font-medium">{workflow}</span>
                                <div className="flex flex-wrap gap-3">{workflowActions.map(action => <label key={action} className="flex items-center gap-1 text-xs"><input type="checkbox" disabled={!canManage} checked={workflowMatrix[authorityRole]?.[workflow]?.includes(action) || false} onChange={event => toggleAuthority('workflow',authorityRole,workflow,action,event.target.checked)} />{action}</label>)}</div>
                            </div>)}
                        </div>
                    </div>
                </div>
            </Card>

            <div className="grid gap-4 lg:grid-cols-3">
                <Card title="Data scope"><p className="text-sm text-gray-600">Supports Self, Direct Reports, Department, Home Business Unit, Selected Business Units, and Global scope. Per-user effective scope is shown in User Management.</p></Card>
                <Card title="Sensitive data"><p className="text-sm text-gray-600">Salary, banking, government numbers, documents, medical, disciplinary, evaluation, payroll staging, and final pay are protected independently from feature access.</p></Card>
                <Card title="Workflow authority"><p className="text-sm text-gray-600">Submit, Review, Approve, Reject, Return, Cancel, and Finalize are checked independently for each workflow.</p></Card>
            </div>

            <Card title="Test as this role (read-only)">
                <p className="text-sm text-gray-600">{authorityRole} resolves to {Object.keys(permissions[authorityRole] || {}).length} feature resources, {Object.keys(sensitiveMatrix[authorityRole] || {}).length} sensitive categories, and {Object.keys(workflowMatrix[authorityRole] || {}).length} workflows. This preview never changes your session or bypasses RLS.</p>
            </Card>

            <Card title="RBAC audit history">
                <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b text-xs uppercase text-gray-500"><th className="p-2">Time</th><th className="p-2">Action</th><th className="p-2">Target</th><th className="p-2">Actor</th></tr></thead><tbody>{auditRows.map(row => <tr key={row.id} className="border-b"><td className="p-2">{new Date(row.created_at).toLocaleString()}</td><td className="p-2">{row.action}</td><td className="p-2">{row.entity_type}: {row.entity_id || '—'}</td><td className="p-2">{row.actor_user_id || 'System migration'}</td></tr>)}</tbody></table></div>
            </Card>
        </div>
    );
};

export default RolesPermissions;
