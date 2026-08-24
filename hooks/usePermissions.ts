import { supabase } from '../services/supabaseClient';
import { useAuth } from './useAuth';
import { usePermissionsContext } from '../context/PermissionsContext';
import { useSettings } from '../context/SettingsContext';
import { Resource, Permission, Role, IncidentReport, Ticket, BusinessUnit, Department, Evaluation, EvaluatorType, User, COERequest, OTRequest, OTStatus, COEApprovalAuthority } from '../types';

export const usePermissions = () => {
    const { user: sessionUser } = useAuth();
    const { effectiveRbac, loadingPermissions, authorizationError } = usePermissionsContext();
    const { approverConfigs } = useSettings();

    // Use the session user directly from AuthContext (live Supabase data)
    const getCurrentUser = () => {
        return sessionUser || null;
    };

    const getAccessibleBusinessUnits = (allBusinessUnits: BusinessUnit[]): BusinessUnit[] => {
        const user = getCurrentUser();
        if (!user || !effectiveRbac?.authorized) return [];
        const scope = effectiveRbac.dataScope || user.accessScope || { type: 'SELF' as const };

        if (scope.type === 'GLOBAL') {
            return allBusinessUnits;
        }

        if (scope.type === 'SPECIFIC') {
            if (!scope.allowedBuIds || scope.allowedBuIds.length === 0) {
                return [];
            }
            return allBusinessUnits.filter(bu => scope.allowedBuIds?.includes(bu.id));
        }

        if (user.businessUnitId) {
            return allBusinessUnits.filter(bu => bu.id === user.businessUnitId);
        }
        if (user.businessUnit) {
            return allBusinessUnits.filter(bu => bu.name === user.businessUnit);
        }
        return [];
    };

    const can = (resource: Resource, permission: Permission): boolean => {
        const user = getCurrentUser();
        if (!user || loadingPermissions || authorizationError || !effectiveRbac?.authorized) return false;
        const aliases: Partial<Record<Resource, Resource>> = {
            Requisitions: 'JobRequisitions' as Resource,
            Clock: 'ClockInOut' as Resource,
            ClockLog: 'ClockLogs' as Resource,
            Exceptions: 'AttendanceExceptions' as Resource,
            PayrollPrep: 'PayrollPreparation' as Resource,
            Reports: 'PayrollReports' as Resource,
            Offboarding: 'OffboardingResignation' as Resource,
            Calendar: 'CompanyCalendar' as Resource,
            OrgChart: 'OrganizationalChart' as Resource,
            SiteManagement: 'Sites' as Resource,
            'Employee Correspondence': 'ContractsSigning' as Resource,
            MyCases: 'IncidentReports' as Resource,
        };
        const resolvedResource = aliases[resource] || resource;
        const resourcePermissions = effectiveRbac.features[resolvedResource];
        
        if (!resourcePermissions || resourcePermissions.length === 0) {
            return false;
        }

        if (resourcePermissions.includes(Permission.Manage)) {
            return true;
        }

        return resourcePermissions.includes(permission);
    };

    const workflowCan = (workflow: string, action: Permission): boolean => {
        if (!effectiveRbac?.authorized || loadingPermissions || authorizationError) return false;
        const actions = effectiveRbac.workflows[workflow] || [];
        return actions.includes(action);
    };

    const effectiveScope = (): 'global' | 'bu' | 'dept' | 'team' | 'self' | 'none' => {
        switch (effectiveRbac?.dataScope?.type) {
            case 'GLOBAL': return 'global';
            case 'SPECIFIC':
            case 'HOME_ONLY': return 'bu';
            case 'DEPARTMENT': return 'dept';
            case 'DIRECT_REPORTS': return 'team';
            case 'SELF': return 'self';
            default: return 'none';
        }
    };

    const getVisibleEmployeeIds = (): string[] => {
        const user = getCurrentUser();
        if (!user) return [];

        const scopeType = effectiveRbac?.dataScope?.type || user.accessScope?.type;
        if (scopeType === 'GLOBAL') {
            // For broad-access roles, return empty to signal "all visible" — callers should treat empty as global
            return [];
        }

        if (scopeType === 'DIRECT_REPORTS') {
            // Manager scope: self only (team filtering done at query level via Supabase)
            return [user.id];
        }

        return [user.id];
    };

    const hasDirectReports = (): boolean => {
        const user = getCurrentUser();
        if (!user) return false;
        return ['global', 'bu', 'dept', 'team'].includes(effectiveScope());
    };

    const filterByScope = <T extends { employeeId: string }>(data: T[]): T[] => {
        const user = getCurrentUser();
        if (!user) return [];
        const visibleIds = getVisibleEmployeeIds();
        
        // Empty array means global access
        if (visibleIds.length === 0) {
            return data;
        }

        return data.filter(item => visibleIds.includes(item.employeeId));
    };

    const filterIncidentReportsByScope = (data: IncidentReport[]): IncidentReport[] => {
        const user = getCurrentUser();
        if (!user) return [];
        const visibleIds = getVisibleEmployeeIds();

        // Empty array means global access
        if (visibleIds.length === 0) {
            return data;
        }

        return data.filter(item =>
            item.involvedEmployeeIds.some(id => visibleIds.includes(id))
        );
    };

    const getTicketAccess = () => {
        return {
            canSubmit: can('Helpdesk', Permission.Create) || can('Helpdesk', Permission.Submit),
            canRespond: can('Helpdesk', Permission.Edit) || can('Helpdesk', Permission.Manage),
            canView: can('Helpdesk', Permission.View),
            scope: effectiveScope(),
        };
    };

    const filterTicketsByScope = (data: Ticket[]): Ticket[] => {
        const user = getCurrentUser();
        if (!user) return [];
        const access = getTicketAccess();
        if (!access.canView && !access.canRespond) return [];

        return data.filter(item => {
            if (item.assignedToId === user.id) return true;

            if (access.scope === 'global') return true;

            if (access.scope === 'self') {
                return item.requesterId === user.id;
            }

            if (access.scope === 'bu') {
                const matchesBuId = item.businessUnitId && user.businessUnitId && item.businessUnitId === user.businessUnitId;
                const matchesBuName = item.businessUnitName && user.businessUnit && item.businessUnitName === user.businessUnit;
                return matchesBuId || matchesBuName || item.requesterId === user.id;
            }

            return false;
        });
    };

    /**
     * Checks if the current user is eligible to evaluate a specific subject based on the evaluation configuration.
     * Handles both Individual assignments and Group logic (BU/Dept matching).
     */
    const isUserEligibleEvaluator = (user: User, evaluation: Evaluation, subjectId: string): boolean => {
        // User cannot evaluate themselves unless it is a Self Evaluation (which is usually an Individual config pointing to them)
        // However, the 'excludeSubject' flag in Group configs handles the self-exclusion.

        if (subjectId === user.id && evaluation.targetEmployeeIds.includes(user.id)) {
            return true;
        }

        return evaluation.evaluators.some(config => {
            // 1. Individual Assignment
            if (config.type === EvaluatorType.Individual) {
                return config.userId === user.id && subjectId === config.userId ? true : config.userId === user.id;
                // Logic tweak: If Individual, and userId matches user.id, they are eligible. 
                // If it's a self-eval, userId will equal subjectId.
            }

            // 2. Group Assignment
            if (config.type === EvaluatorType.Group && config.groupFilter) {
                // Check Self-Exclusion
                if (config.excludeSubject && user.id === subjectId) {
                    return false;
                }

                const targetBuId = config.groupFilter?.businessUnitId;
                const targetDeptId = config.groupFilter?.departmentId;
                const targetBuName = targetBuId
                    ? undefined // BU name lookup deferred to caller
                    : undefined;
                const targetDeptName = targetDeptId
                    ? undefined // Dept name lookup deferred to caller
                    : undefined;

                if (targetBuId) {
                    if (user.businessUnitId && user.businessUnitId !== targetBuId) {
                        return false;
                    }
                    if (!user.businessUnitId && targetBuName && user.businessUnit !== targetBuName) {
                        return false;
                    }
                }

                if (targetDeptId) {
                    if (user.departmentId && user.departmentId !== targetDeptId) {
                        return false;
                    }
                    if (!user.departmentId && targetDeptName && user.department !== targetDeptName) {
                        return false;
                    }
                }

                // If we got here, the user matches the group criteria
                return true;
            }

            return false;
        });
    };

    const getDashboardRequestAccess = (workflow = 'Leave') => {
        const resourceByWorkflow: Record<string, Resource> = {
            Leave: 'Leave', WFH: 'WFH', Overtime: 'OT', Manpower: 'Manpower',
        };
        const resource = resourceByWorkflow[workflow] || 'Dashboard';
        return {
            canRequest: workflowCan(workflow, Permission.Submit),
            canApprove: workflowCan(workflow, Permission.Approve),
            canView: can(resource, Permission.View),
            scope: effectiveScope(),
        };
    };

    const getCoeAccess = () => {
        const user = getCurrentUser();
        if (!user) {
            return {
                canRequest: false,
                canApprove: false,
                canView: false,
                scope: 'none' as const,
                filterRequests: (_reqs: COERequest[]) => [],
                canActOn: (_req: COERequest) => false,
            };
        }

        const canRequest = workflowCan('COE', Permission.Submit);
        const assignedRoles = new Set([user.role, ...(user.roles || [])]);
        const configuredApproverRoles = approverConfigs.coeApproval.authority === COEApprovalAuthority.HRStaff
            ? [Role.HRStaff]
            : approverConfigs.coeApproval.authority === COEApprovalAuthority.HRManagerOrHRStaff
                ? [Role.HRManager, Role.HRStaff]
                : [Role.HRManager];
        const canApprove = workflowCan('COE', Permission.Approve)
            && configuredApproverRoles.some(role => assignedRoles.has(role));
        const canView = can('COE', Permission.View);
        const scope = effectiveScope();

        const filterRequests = (requests: COERequest[]): COERequest[] => {
            if (!canView) return [];
            if (scope === 'global') return requests;

            if (scope === 'self') {
                return requests.filter(r => r.employeeId === user.id);
            }

            if (scope === 'team') {
                const deptId = user.departmentId;
                const buIds = new Set([user.businessUnitId].filter(Boolean) as string[]);

                return requests.filter(r => {
                    const isSelf = r.employeeId === user.id;
                    const sameBu = r.businessUnitId ? buIds.has(r.businessUnitId) : true;
                    const sameDept =
                        deptId && r.employeeDepartmentId
                            ? deptId === r.employeeDepartmentId
                            : true; // if dept missing on either side, rely on BU
                    return isSelf || (sameBu && sameDept);
                });
            }

            if (scope === 'dept') {
                const targetDeptId = user.departmentId;
                const targetBuIds = new Set([user.businessUnitId].filter(Boolean) as string[]);

                return requests.filter(r => {
                    const matchesDept = targetDeptId && r.employeeDepartmentId ? r.employeeDepartmentId === targetDeptId : false;
                    const matchesBu = targetBuIds.has(r.businessUnitId);
                    return matchesDept || matchesBu;
                });
            }

            if (scope === 'bu') {
                const accessibleBuIds = new Set([user.businessUnitId].filter(Boolean) as string[]);
                return requests.filter(r => accessibleBuIds.has(r.businessUnitId));
            }

            return [];
        };

        const canActOn = (request: COERequest) => {
            if (!canApprove) return false;
            return filterRequests([request]).length > 0;
        };

        return { canRequest, canApprove, canView, scope, filterRequests, canActOn };
    };

    const getOtAccess = () => {
        const user = getCurrentUser();
        if (!user) {
            return {
                canRequest: false,
                canApprove: false,
                canView: false,
                scope: 'none' as const,
                filterRequests: (_reqs: OTRequest[]) => [],
                canActOn: (_req: OTRequest) => false,
            };
        }

        const canRequest = workflowCan('Overtime', Permission.Submit);
        const canApprove = workflowCan('Overtime', Permission.Approve);
        const canView = can('OT', Permission.View);
        const scope = effectiveScope();

        const filterRequests = (requests: OTRequest[]): OTRequest[] => {
            if (!canView) return [];
            if (scope === 'global') return requests;
            if (scope === 'self') return requests.filter(r => r.employeeId === user.id);
            if (scope === 'team') {
                // OTRequest has no BU/dept fields; for team scope just show self
                return requests.filter(r => r.employeeId === user.id);
            }
            if (scope === 'dept') {
                // OTRequest has no dept field; show self 
                return requests.filter(r => r.employeeId === user.id);
            }
            if (scope === 'bu') {
                // OTRequest has no BU field; show self
                return requests.filter(r => r.employeeId === user.id);
            }
            return [];
        };

        const canActOn = (request: OTRequest) => {
            if (!canApprove) return false;
            if (request.status === OTStatus.Approved || request.status === OTStatus.Rejected) return false;
            return filterRequests([request]).length > 0;
        };

        return { canRequest, canApprove, canView, scope, filterRequests, canActOn };
    };

    const getIrAccess = () => {
        const user = getCurrentUser();
        if (!user) {
            return { canCreate: false, canView: false, scope: 'none' as const };
        }
        return {
            canCreate: can('IncidentReports' as Resource, Permission.Create) || workflowCan('IncidentReports', Permission.Submit),
            canView: can('IncidentReports' as Resource, Permission.View),
            scope: effectiveScope(),
        };
    };

    const getAwardsAccess = () => {
        const user = getCurrentUser();
        if (!user) return { canAssign: false, canApprove: false, canView: false, scope: 'none' as const };
        return {
            canAssign: can('Awards' as Resource, Permission.Assign),
            canApprove: workflowCan('Awards', Permission.Approve),
            canView: can('Awards' as Resource, Permission.View),
            scope: effectiveScope(),
        };
    };

    const getPanAccess = () => {
        const user = getCurrentUser();
        if (!user) return { canView: false, canRespond: false, canCreate: false, canManageTemplates: false, scope: 'none' as const };
        const roles = new Set(user.roles?.length ? user.roles : [user.role]);
        return {
            canView: can('PersonnelActionNotices' as Resource, Permission.View),
            canRespond: workflowCan('PersonnelActionNotices', Permission.Review),
            canCreate: can('PersonnelActionNotices' as Resource, Permission.Create),
            canManageTemplates: roles.has(Role.Admin)
                || roles.has(Role.HRManager)
                || can('PersonnelActionNotices' as Resource, Permission.Manage)
                || can('PersonnelActionNotices' as Resource, Permission.Publish),
            scope: effectiveScope(),
        };
    };

    const getJobRequisitionAccess = () => {
        const user = getCurrentUser();
        if (!user) {
            return { canCreate: false, canView: false, scope: 'none' as const };
        }
        return {
            canCreate: can('JobRequisitions' as Resource, Permission.Create) || workflowCan('JobRequisitions', Permission.Submit),
            canView: can('JobRequisitions' as Resource, Permission.View),
            scope: effectiveScope(),
        };
    };

    const getAnnouncementAccess = () => {
        const user = getCurrentUser();
        if (!user) {
            return { canView: false, canManage: false, scope: 'none' as const };
        }
        return {
            canView: can('Announcements', Permission.View),
            canManage: can('Announcements', Permission.Manage) || can('Announcements', Permission.Publish),
            scope: effectiveScope(),
        };
    };

    const getLifecycleAccess = () => {
        const user = getCurrentUser();
        if (!user) return { canView: false, canManage: false, scope: 'none' as const };
        return {
            canView: can('Onboarding' as Resource, Permission.View) || can('OffboardingResignation' as Resource, Permission.View),
            canManage: can('Onboarding' as Resource, Permission.Manage) || can('OffboardingResignation' as Resource, Permission.Manage),
            scope: effectiveScope(),
        };
    };

    /**
     * Returns true when Admin is one of the server-resolved active roles. Admin
     * is not a blanket HR or sensitive-data bypass.
     */
    const isSuperAdmin = (): boolean => {
        return effectiveRbac?.authorized === true && effectiveRbac.roles.includes(Role.Admin);
    };

    return { can, workflowCan, isSuperAdmin, getVisibleEmployeeIds, filterByScope, filterIncidentReportsByScope, filterTicketsByScope, hasDirectReports, getAccessibleBusinessUnits, isUserEligibleEvaluator, getDashboardRequestAccess, getCoeAccess, getOtAccess, getTicketAccess, getIrAccess, getJobRequisitionAccess, getAnnouncementAccess, getAwardsAccess, getPanAccess, getLifecycleAccess };
};
