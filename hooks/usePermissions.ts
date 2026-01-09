
import { useAuth } from './useAuth';
import { useSettings } from '../context/SettingsContext';
import { mockPermissions, mockUsers, mockBusinessUnits, mockDepartments } from '../services/mockData';
import { Resource, Permission, Role, IncidentReport, Ticket, BusinessUnit, Evaluation, EvaluatorType, User, COERequest, OTRequest, OTStatus } from '../types';

// Contracts RBAC matrix derived from user request
const contractsPermissions: Record<Role, Permission[]> = {
  [Role.Admin]: [Permission.Manage],
  [Role.HRManager]: [Permission.Manage],
  [Role.HRStaff]: [Permission.Manage],
  [Role.BOD]: [Permission.View],
  [Role.GeneralManager]: [], // None
  [Role.OperationsDirector]: [], // None
  [Role.BusinessUnitManager]: [], // None
  [Role.Manager]: [], // None
  [Role.Employee]: [], // None
  [Role.FinanceStaff]: [], // None
  [Role.Auditor]: [], // None
  [Role.Recruiter]: [Permission.Manage], // Full per matrix
  [Role.IT]: [], // None
};

// Benefits RBAC matrix
const benefitsPermissions: Record<Role, Permission[]> = {
  [Role.Admin]: [Permission.Manage],
  [Role.HRManager]: [Permission.Manage],
  [Role.HRStaff]: [Permission.Manage],
  [Role.BOD]: [Permission.View],
  [Role.GeneralManager]: [Permission.Approve], // View + respond
  [Role.OperationsDirector]: [Permission.Approve], // View + respond
  [Role.BusinessUnitManager]: [], // None
  [Role.Manager]: [], // None
  [Role.Employee]: [], // None
  [Role.FinanceStaff]: [Permission.Manage],
  [Role.Auditor]: [Permission.View], // View logs
  [Role.Recruiter]: [Permission.Manage],
  [Role.IT]: [], // None
};

// Asset Management RBAC matrix
const assetManagementPermissions: Record<Role, Permission[]> = {
  [Role.Admin]: [Permission.Manage],
  [Role.HRManager]: [Permission.Manage],
  [Role.HRStaff]: [Permission.Manage],
  [Role.BOD]: [Permission.View],
  [Role.GeneralManager]: [Permission.View], // View BU/Departments (scope handled elsewhere)
  [Role.OperationsDirector]: [Permission.View], // View BU/Departments
  [Role.BusinessUnitManager]: [Permission.View], // Own BU
  [Role.Manager]: [Permission.View], // Own Team
  [Role.Employee]: [], // None
  [Role.FinanceStaff]: [], // None
  [Role.Auditor]: [], // None
  [Role.Recruiter]: [Permission.Manage],
  [Role.IT]: [Permission.Manage],
};

// Coaching Log RBAC matrix
const coachingPermissions: Record<Role, Permission[]> = {
  [Role.Admin]: [Permission.Manage],
  [Role.HRManager]: [Permission.Manage],
  [Role.HRStaff]: [Permission.Manage],
  [Role.BOD]: [Permission.View],
  [Role.GeneralManager]: [Permission.View], // View BU/Departments (scope handled elsewhere)
  [Role.OperationsDirector]: [Permission.View], // View BU only
  [Role.BusinessUnitManager]: [Permission.View], // Own BU
  [Role.Manager]: [Permission.View], // Own Team
  [Role.Employee]: [Permission.View], // Own logs
  [Role.FinanceStaff]: [], // None
  [Role.Auditor]: [], // None
  [Role.Recruiter]: [], // None
  [Role.IT]: [], // None
};

// Memo Library RBAC matrix
const memoPermissions: Record<Role, Permission[]> = {
  [Role.Admin]: [Permission.Manage],
  [Role.HRManager]: [Permission.Manage],
  [Role.HRStaff]: [Permission.Manage],
  [Role.BOD]: [Permission.View],
  [Role.GeneralManager]: [Permission.View], // View BU/Departments (scope handled elsewhere)
  [Role.OperationsDirector]: [Permission.View], // View BU only
  [Role.BusinessUnitManager]: [Permission.View], // Own BU
  [Role.Manager]: [Permission.View], // Own Team
  [Role.Employee]: [Permission.View], // Own BU
  [Role.FinanceStaff]: [], // None
  [Role.Auditor]: [], // None
  [Role.Recruiter]: [Permission.Manage], // Full
  [Role.IT]: [], // None
};

// Code of Discipline RBAC
const codeOfDisciplinePermissions: Record<Role, Permission[]> = {
  [Role.Admin]: [Permission.Manage],
  [Role.HRManager]: [Permission.Manage],
  [Role.HRStaff]: [Permission.Manage],
  [Role.BOD]: [Permission.View],
  [Role.GeneralManager]: [Permission.View], // View BU/Departments (scope handled elsewhere)
  [Role.OperationsDirector]: [Permission.View], // View BU only
  [Role.BusinessUnitManager]: [Permission.View], // Own BU
  [Role.Manager]: [Permission.View], // Own Team
  [Role.Employee]: [Permission.View], // Own BU
  [Role.FinanceStaff]: [], // None
  [Role.Auditor]: [], // None
  [Role.Recruiter]: [Permission.Manage], // Full
  [Role.IT]: [], // None
};

// Feedback Templates RBAC
const feedbackTemplatesPermissions: Record<Role, Permission[]> = {
  [Role.Admin]: [Permission.Manage],
  [Role.HRManager]: [Permission.Manage],
  [Role.HRStaff]: [Permission.Manage],
  [Role.BOD]: [Permission.View],
  [Role.GeneralManager]: [], // None
  [Role.OperationsDirector]: [], // None
  [Role.BusinessUnitManager]: [], // None
  [Role.Manager]: [], // None
  [Role.Employee]: [], // None
  [Role.FinanceStaff]: [], // None
  [Role.Auditor]: [], // None
  [Role.Recruiter]: [], // None
  [Role.IT]: [], // None
};

// Pipeline RBAC
const pipelinePermissions: Record<Role, Permission[]> = {
  [Role.Admin]: [Permission.Manage],
  [Role.HRManager]: [Permission.Manage],
  [Role.HRStaff]: [Permission.Manage],
  [Role.BOD]: [Permission.View],
  [Role.GeneralManager]: [], // None
  [Role.OperationsDirector]: [], // None
  [Role.BusinessUnitManager]: [], // None
  [Role.Manager]: [], // None
  [Role.Employee]: [], // None
  [Role.FinanceStaff]: [], // None
  [Role.Auditor]: [], // None
  [Role.Recruiter]: [], // None
  [Role.IT]: [], // None
};

// Workforce Planning RBAC
const workforcePlanningPermissions: Record<Role, Permission[]> = {
  [Role.Admin]: [Permission.Manage],
  [Role.HRManager]: [Permission.Manage],
  [Role.HRStaff]: [Permission.Manage],
  [Role.BOD]: [Permission.View],
  [Role.GeneralManager]: [Permission.View], // View BU/Departments
  [Role.OperationsDirector]: [Permission.View], // View BU only
  [Role.BusinessUnitManager]: [Permission.View], // Own BU
  [Role.Manager]: [Permission.View], // Own Team
  [Role.Employee]: [], // None
  [Role.FinanceStaff]: [], // None
  [Role.Auditor]: [], // None
  [Role.Recruiter]: [], // None
  [Role.IT]: [], // None
};

export const usePermissions = () => {
    const { user: sessionUser } = useAuth();
    const { isRbacEnabled } = useSettings();

    // Helper to get the freshest user data from source of truth (mockData)
    const getCurrentUser = () => {
        if (!sessionUser) return null;
        return mockUsers.find(u => u.id === sessionUser.id) || sessionUser;
    };

    const getAccessibleBusinessUnits = (allBusinessUnits: BusinessUnit[]): BusinessUnit[] => {
        const user = getCurrentUser();
        if (!user) return [];

        // Special Rule: Managers of Marketing, Finance, and HR get global view access
        const specialDepartments = ['Marketing', 'Finance', 'Finance and Accounting', 'Human Resources'];
        if (user.role === Role.Manager && user.department && specialDepartments.includes(user.department)) {
            return allBusinessUnits;
        }

        const scope = user.accessScope || { type: 'HOME_ONLY' };

        if (scope.type === 'GLOBAL') {
            return allBusinessUnits;
        }

        if (scope.type === 'SPECIFIC') {
            if (!scope.allowedBuIds || scope.allowedBuIds.length === 0) {
                return [];
            }
            return allBusinessUnits.filter(bu => scope.allowedBuIds?.includes(bu.id));
        }

        return allBusinessUnits.filter(bu => bu.name === user.businessUnit);
    };

    const can = (resource: Resource, permission: Permission): boolean => {
        const user = getCurrentUser();

        if (!isRbacEnabled || user?.role === Role.Admin) {
            return true;
        }

        if (!user) {
            return false;
        }

        // Contracts & Signing custom matrix (only if rbac enabled)
        if (resource === 'Contracts & Signing' as Resource) {
            const perms = contractsPermissions[user.role];
            if (!perms || perms.length === 0) {
                return false;
            }
            if (perms.includes(Permission.Manage)) return true;
            if (permission === Permission.View && perms.length > 0) return true;
            return perms.includes(permission);
        }

        if (resource === 'Benefits') {
            const perms = benefitsPermissions[user.role];
            if (!perms || perms.length === 0) {
                return false;
            }
            if (perms.includes(Permission.Manage)) return true;
            if (permission === Permission.View && perms.length > 0) return true;
            return perms.includes(permission);
        }

        if (resource === 'Assets') {
            const perms = assetManagementPermissions[user.role];
            if (!perms || perms.length === 0) {
                return false;
            }
            if (perms.includes(Permission.Manage)) return true;
            if (permission === Permission.View && perms.length > 0) return true;
            return perms.includes(permission);
        }

        if (resource === 'MemoLibrary') {
            const perms = memoPermissions[user.role];
            if (!perms || perms.length === 0) {
                return false;
            }
            if (perms.includes(Permission.Manage)) return true;
            if (permission === Permission.View && perms.length > 0) return true;
            return perms.includes(permission);
        }

        if (resource === 'FeedbackTemplates') {
            const perms = feedbackTemplatesPermissions[user.role];
            if (!perms || perms.length === 0) return false;
            if (perms.includes(Permission.Manage)) return true;
            if (permission === Permission.View && perms.length > 0) return true;
            return perms.includes(permission);
        }

        if (resource === 'Pipeline') {
            const perms = pipelinePermissions[user.role];
            if (!perms || perms.length === 0) return false;
            if (perms.includes(Permission.Manage)) return true;
            if (permission === Permission.View && perms.length > 0) return true;
            return perms.includes(permission);
        }

        if (resource === 'WorkforcePlanning' || resource === 'WorkforcePlanningAdmin') {
            const perms = workforcePlanningPermissions[user.role];
            if (!perms || perms.length === 0) return false;
            if (perms.includes(Permission.Manage)) return true;
            if (permission === Permission.View && perms.length > 0) return true;
            return perms.includes(permission);
        }

        if (resource === 'Coaching') {
            const perms = coachingPermissions[user.role];
            if (!perms || perms.length === 0) {
                return false;
            }
            if (perms.includes(Permission.Manage)) return true;
            if (permission === Permission.View && perms.length > 0) return true;
            return perms.includes(permission);
        }

        if (resource === 'CodeOfDiscipline') {
            const perms = codeOfDisciplinePermissions[user.role];
            if (!perms || perms.length === 0) return false;
            if (perms.includes(Permission.Manage)) return true;
            if (permission === Permission.View && perms.length > 0) return true;
            return perms.includes(permission);
        }

        const rolePermissions = mockPermissions[user.role];
        if (!rolePermissions) {
            return false;
        }

        const resourcePermissions = rolePermissions[resource];
        if (!resourcePermissions || resourcePermissions.length === 0) {
            return false;
        }
        
        if (permission === Permission.View && resourcePermissions.length > 0) {
            return true;
        }

        if (resourcePermissions.includes(Permission.Manage)) {
            return true;
        }

        return resourcePermissions.includes(permission);
    };

    const getVisibleEmployeeIds = (): string[] => {
        const user = getCurrentUser();
        if (!user) return [];
        
        if ([Role.Admin, Role.HRManager, Role.HRStaff, Role.BOD, Role.GeneralManager, Role.Auditor, Role.FinanceStaff, Role.Recruiter, Role.BusinessUnitManager, Role.OperationsDirector].includes(user.role)) {
            const accessibleBUs = getAccessibleBusinessUnits(mockBusinessUnits);
            const accessibleBuNames = new Set(accessibleBUs.map(bu => bu.name));
            
            return mockUsers
                .filter(u => accessibleBuNames.has(u.businessUnit))
                .map(u => u.id);
        }

        const managerRoles = [Role.Manager];
        if (managerRoles.includes(user.role)) {
            const teamIds = mockUsers.filter(u => u.managerId === user.id).map(u => u.id);
            return [user.id, ...teamIds];
        }

        return [user.id];
    };
    
    const hasDirectReports = (): boolean => {
        const user = getCurrentUser();
        if (!user) return false;
        return mockUsers.some(u => u.managerId === user.id && u.status === 'Active');
    };
    
    const filterByScope = <T extends { employeeId: string }>(data: T[]): T[] => {
        const user = getCurrentUser();
        if (!user) return [];
        const visibleIds = getVisibleEmployeeIds();
        return data.filter(item => visibleIds.includes(item.employeeId));
    };
    
    const filterIncidentReportsByScope = (data: IncidentReport[]): IncidentReport[] => {
        const user = getCurrentUser();
        if (!user) return [];
        const visibleIds = getVisibleEmployeeIds();
        
        return data.filter(item => 
            item.involvedEmployeeIds.some(id => visibleIds.includes(id))
        );
    };

    const getTicketAccess = () => {
        const user = getCurrentUser();
        if (!user) {
            return {
                canSubmit: false,
                canRespond: false,
                canView: false,
                scope: 'none' as const,
            };
        }

        switch (user.role) {
            case Role.Admin:
            case Role.HRManager:
            case Role.HRStaff:
                return { canSubmit: true, canRespond: true, canView: true, scope: 'global' as const }; // Full
            case Role.BOD:
                return { canSubmit: false, canRespond: false, canView: true, scope: 'global' as const }; // View
            case Role.GeneralManager:
            case Role.OperationsDirector:
            case Role.BusinessUnitManager:
                return { canSubmit: false, canRespond: true, canView: true, scope: 'bu' as const }; // View & Respond (BU)
            case Role.FinanceStaff:
            case Role.IT:
                return { canSubmit: false, canRespond: true, canView: true, scope: 'global' as const }; // View & Respond
            case Role.Employee:
                return { canSubmit: true, canRespond: false, canView: true, scope: 'self' as const }; // Own
            case Role.Auditor:
                return { canSubmit: false, canRespond: false, canView: true, scope: 'global' as const }; // View Logs
            case Role.Manager:
            case Role.Recruiter:
                return { canSubmit: false, canRespond: false, canView: false, scope: 'none' as const }; // None
            default:
                return { canSubmit: false, canRespond: false, canView: false, scope: 'none' as const };
        }
    };

    const filterTicketsByScope = (data: Ticket[]): Ticket[] => {
        const user = getCurrentUser();
        if (!user) return [];
        const access = getTicketAccess();
        if (!access.canView && !access.canRespond) return [];

        return data.filter(item => {
            if (item.assignedToId === user.id && access.canRespond) return true;

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

                // Resolve IDs to Names for matching against User object
                const targetBuName = mockBusinessUnits.find(b => b.id === config.groupFilter?.businessUnitId)?.name;
                const targetDeptName = config.groupFilter?.departmentId 
                    ? mockDepartments.find(d => d.id === config.groupFilter?.departmentId)?.name 
                    : null;

                // Check Business Unit Match
                if (targetBuName && user.businessUnit !== targetBuName) {
                    return false;
                }

                // Check Department Match (if specified)
                if (targetDeptName && user.department !== targetDeptName) {
                    return false;
                }

                // If we got here, the user matches the group criteria
                return true;
            }

            return false;
        });
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

        let canRequest = false;
        let canApprove = false;
        let canView = false;
        let scope: 'global' | 'bu' | 'team' | 'self' | 'dept' | 'none' = 'none';

        switch (user.role) {
            case Role.Admin:
            case Role.HRManager:
            case Role.HRStaff:
                canRequest = true;
                canApprove = true;
                canView = true;
                scope = 'global';
                break;
            case Role.BOD:
                canRequest = false;
                canApprove = false;
                canView = true;
                scope = 'global';
                break;
            case Role.GeneralManager:
                canRequest = false;
                canApprove = false;
                canView = true;
                scope = 'dept'; // View BU/Department
                break;
            case Role.OperationsDirector:
                canRequest = false;
                canApprove = true;
                canView = true;
                scope = 'bu';
                break;
            case Role.BusinessUnitManager:
                canRequest = true;
                canApprove = false;
                canView = true;
                scope = 'bu';
                break;
            case Role.Manager:
                canRequest = true;
                canApprove = true; // Own team
                canView = true;
                scope = 'team';
                break;
            case Role.Employee:
                canRequest = true;
                canView = true;
                scope = 'self';
                break;
            case Role.Auditor:
                canRequest = false;
                canApprove = false;
                canView = false; // Logs only, not COE queue
                scope = 'none';
                break;
            default:
                scope = 'none';
        }

        const filterRequests = (requests: COERequest[]): COERequest[] => {
            if (!canView) return [];
            if (scope === 'global') return requests;

            if (scope === 'self') {
                return requests.filter(r => r.employeeId === user.id);
            }

            if (scope === 'team') {
                const teamIds = mockUsers.filter(u => u.managerId === user.id).map(u => u.id);
                const deptId = user.departmentId;
                const buIds = new Set([
                    ...(getAccessibleBusinessUnits(mockBusinessUnits).map(bu => bu.id)),
                    user.businessUnitId
                ].filter(Boolean) as string[]);

                return requests.filter(r => {
                    const isTeam = teamIds.includes(r.employeeId);
                    const isSelf = r.employeeId === user.id;
                    const sameBu = r.businessUnitId ? buIds.has(r.businessUnitId) : true; // allow if BU is missing
                    const sameDept =
                        deptId && r.employeeDepartmentId
                            ? deptId === r.employeeDepartmentId
                            : true; // if dept missing on either side, rely on BU
                    return isSelf || isTeam || (sameBu && sameDept);
                });
            }

            if (scope === 'dept') {
                const targetDeptId = user.departmentId;
                const targetBuIds = new Set([
                    ...(getAccessibleBusinessUnits(mockBusinessUnits).map(bu => bu.id)),
                    user.businessUnitId
                ].filter(Boolean) as string[]);

                return requests.filter(r => {
                    const matchesDept = targetDeptId && r.employeeDepartmentId ? r.employeeDepartmentId === targetDeptId : false;
                    const matchesBu = targetBuIds.has(r.businessUnitId);
                    return matchesDept || matchesBu;
                });
            }

            if (scope === 'bu') {
                const accessibleBuIds = new Set([
                    ...(getAccessibleBusinessUnits(mockBusinessUnits).map(bu => bu.id)),
                    user.businessUnitId
                ].filter(Boolean) as string[]);
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

        let canRequest = false;
        let canApprove = false;
        let canView = false;
        let scope: 'global' | 'bu' | 'team' | 'self' | 'dept' | 'none' = 'none';

        switch (user.role) {
            case Role.Admin:
            case Role.HRManager:
            case Role.HRStaff:
                canRequest = true;
                canApprove = true;
                canView = true;
                scope = 'global';
                break;
            case Role.BOD:
                canView = true;
                scope = 'global';
                break;
            case Role.GeneralManager:
                canView = true;
                scope = 'dept';
                break;
            case Role.OperationsDirector:
                canApprove = true;
                canView = true;
                scope = 'bu';
                break;
            case Role.BusinessUnitManager:
                canRequest = true;
                canView = true;
                scope = 'bu';
                break;
            case Role.Manager:
                canRequest = true;
                canApprove = true;
                canView = true;
                scope = 'team';
                break;
            case Role.Employee:
                canRequest = true;
                canView = true;
                scope = 'self';
                break;
            case Role.Auditor:
                canView = true; // view logs
                scope = 'global';
                break;
            default:
                scope = 'none';
        }

        const filterRequests = (requests: OTRequest[]): OTRequest[] => {
            if (!canView) return [];
            if (scope === 'global') return requests;
            if (scope === 'self') return requests.filter(r => r.employeeId === user.id);
            if (scope === 'team') {
                const teamIds = mockUsers.filter(u => u.managerId === user.id).map(u => u.id);
                const deptId = user.departmentId;
                const buIds = new Set([
                    ...(getAccessibleBusinessUnits(mockBusinessUnits).map(bu => bu.id)),
                    user.businessUnitId
                ].filter(Boolean) as string[]);
                return requests.filter(r => {
                    const employee = mockUsers.find(u => u.id === r.employeeId);
                    const isTeam = teamIds.includes(r.employeeId);
                    const isSelf = r.employeeId === user.id;
                    const sameBu = employee?.businessUnitId ? buIds.has(employee.businessUnitId) : true;
                    const sameDept = deptId && employee?.departmentId ? deptId === employee.departmentId : true;
                    return isSelf || isTeam || (sameBu && sameDept);
                });
            }
            if (scope === 'dept') {
                const deptId = user.departmentId;
                const buIds = new Set([
                    ...(getAccessibleBusinessUnits(mockBusinessUnits).map(bu => bu.id)),
                    user.businessUnitId
                ].filter(Boolean) as string[]);
                return requests.filter(r => {
                    const target = mockUsers.find(u => u.id === r.employeeId);
                    const matchesDept = deptId && target?.departmentId ? deptId === target.departmentId : true;
                    const matchesBu = target?.businessUnitId ? buIds.has(target.businessUnitId) : true;
                    return matchesDept && matchesBu;
                });
            }
            if (scope === 'bu') {
                const buIds = new Set([
                    ...(getAccessibleBusinessUnits(mockBusinessUnits).map(bu => bu.id)),
                    user.businessUnitId
                ].filter(Boolean) as string[]);
                return requests.filter(r => {
                    const target = mockUsers.find(u => u.id === r.employeeId);
                    return target?.businessUnitId ? buIds.has(target.businessUnitId) : true;
                });
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

        switch (user.role) {
            case Role.Admin:
            case Role.HRManager:
            case Role.HRStaff:
                return { canCreate: true, canView: true, scope: 'global' as const };
            case Role.BOD:
                return { canCreate: false, canView: true, scope: 'global' as const };
            case Role.GeneralManager:
                return { canCreate: false, canView: true, scope: 'bu' as const };
            case Role.BusinessUnitManager:
            case Role.Manager:
                return { canCreate: true, canView: true, scope: 'self' as const };
            case Role.Employee:
                return { canCreate: true, canView: true, scope: 'self' as const };
            case Role.Auditor:
                return { canCreate: false, canView: true, scope: 'global' as const };
            default:
                return { canCreate: false, canView: false, scope: 'none' as const };
        }
    };

    const getAwardsAccess = () => {
        const user = getCurrentUser();
        if (!user) return { canAssign: false, canApprove: false, canView: false, scope: 'none' as const };
        switch (user.role) {
            case Role.Admin:
            case Role.HRManager:
            case Role.HRStaff:
                return { canAssign: true, canApprove: true, canView: true, scope: 'global' as const };
            case Role.BOD:
                return { canAssign: false, canApprove: false, canView: true, scope: 'global' as const };
            case Role.Auditor:
                return { canAssign: false, canApprove: false, canView: true, scope: 'logs' as const };
            case Role.Employee:
                return { canAssign: false, canApprove: false, canView: true, scope: 'self' as const };
            default:
                // GM, Ops Director, BUM, Manager, Finance, Recruiter, IT -> no access per matrix
                return { canAssign: false, canApprove: false, canView: false, scope: 'none' as const };
        }
    };

    const getPanAccess = () => {
        const user = getCurrentUser();
        if (!user) return { canView: false, canRespond: false, canCreate: false, scope: 'none' as const };
        switch (user.role) {
            case Role.Admin:
            case Role.HRManager:
            case Role.HRStaff:
            case Role.Recruiter: // Full per matrix
                return { canView: true, canRespond: true, canCreate: true, scope: 'global' as const };
            case Role.BOD:
                return { canView: true, canRespond: false, canCreate: false, scope: 'global' as const };
            case Role.GeneralManager:
            case Role.OperationsDirector:
                return { canView: true, canRespond: true, canCreate: false, scope: 'buDept' as const };
            case Role.BusinessUnitManager:
                return { canView: true, canRespond: true, canCreate: false, scope: 'bu' as const };
            case Role.Manager:
                return { canView: true, canRespond: true, canCreate: false, scope: 'team' as const };
            case Role.Employee:
                return { canView: true, canRespond: false, canCreate: false, scope: 'self' as const };
            case Role.Auditor:
            case Role.FinanceStaff:
            case Role.IT:
            default:
                return { canView: false, canRespond: false, canCreate: false, scope: 'none' as const };
        }
    };

    const getJobRequisitionAccess = () => {
        const user = getCurrentUser();
        if (!user) {
            return { canCreate: false, canView: false, scope: 'none' as const };
        }
        switch (user.role) {
            case Role.Admin:
            case Role.HRManager:
            case Role.HRStaff:
            case Role.Recruiter: // Recruiter Full per matrix
                return { canCreate: true, canView: true, scope: 'global' as const };
            case Role.BOD:
                return { canCreate: false, canView: true, scope: 'buDept' as const };
            case Role.GeneralManager:
                return { canCreate: false, canView: true, scope: 'buDept' as const };
            case Role.OperationsDirector:
                return { canCreate: false, canView: true, scope: 'bu' as const }; // View BU only
            case Role.BusinessUnitManager:
                return { canCreate: true, canView: true, scope: 'bu' as const }; // Own BU
            case Role.Manager:
                return { canCreate: true, canView: true, scope: 'team' as const }; // Own Team
            case Role.Employee:
            case Role.FinanceStaff:
                return { canCreate: false, canView: false, scope: 'none' as const };
            case Role.Auditor:
                return { canCreate: false, canView: true, scope: 'logs' as const };
            case Role.IT:
            default:
                return { canCreate: false, canView: false, scope: 'none' as const };
        }
    };

    const getAnnouncementAccess = () => {
        const user = getCurrentUser();
        if (!user) {
            return { canView: false, canManage: false, scope: 'none' as const };
        }
        switch (user.role) {
            case Role.Admin:
            case Role.HRManager:
            case Role.HRStaff:
            case Role.Recruiter: // Full
                return { canView: true, canManage: true, scope: 'global' as const };
            case Role.BOD:
                return { canView: true, canManage: false, scope: 'global' as const };
            case Role.GeneralManager:
                return { canView: true, canManage: false, scope: 'buDept' as const };
            case Role.OperationsDirector:
                return { canView: true, canManage: false, scope: 'bu' as const };
            case Role.BusinessUnitManager:
                return { canView: true, canManage: false, scope: 'ownBu' as const };
            case Role.Manager:
                return { canView: true, canManage: false, scope: 'team' as const };
            case Role.Employee:
                return { canView: true, canManage: false, scope: 'ownBu' as const };
            case Role.Auditor:
                return { canView: true, canManage: false, scope: 'logs' as const };
            case Role.FinanceStaff:
            case Role.IT:
            default:
                return { canView: false, canManage: false, scope: 'none' as const };
        }
    };

    const getLifecycleAccess = () => {
        const user = getCurrentUser();
        if (!user) return { canView: false, canManage: false, scope: 'none' as const };
        switch (user.role) {
            case Role.Admin:
            case Role.HRManager:
            case Role.HRStaff:
            case Role.Recruiter:
                return { canView: true, canManage: true, scope: 'global' as const };
            case Role.BOD:
                return { canView: true, canManage: false, scope: 'global' as const };
            case Role.BusinessUnitManager:
                return { canView: true, canManage: true, scope: 'bu' as const };
            case Role.Manager:
                return { canView: true, canManage: true, scope: 'team' as const };
            case Role.Employee:
                return { canView: true, canManage: false, scope: 'self' as const };
            case Role.GeneralManager:
            case Role.OperationsDirector:
            case Role.FinanceStaff:
            case Role.Auditor:
            case Role.IT:
            default:
                return { canView: false, canManage: false, scope: 'none' as const };
        }
    };


    return { can, getVisibleEmployeeIds, filterByScope, filterIncidentReportsByScope, filterTicketsByScope, hasDirectReports, getAccessibleBusinessUnits, isUserEligibleEvaluator, getCoeAccess, getOtAccess, getTicketAccess, getIrAccess, getJobRequisitionAccess, getAnnouncementAccess, getAwardsAccess, getPanAccess, getLifecycleAccess };
};
