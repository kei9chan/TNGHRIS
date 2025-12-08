
import { useAuth } from './useAuth';
import { useSettings } from '../context/SettingsContext';
import { mockPermissions, mockUsers, mockBusinessUnits, mockDepartments } from '../services/mockData';
import { Resource, Permission, Role, IncidentReport, Ticket, BusinessUnit, Evaluation, EvaluatorType, User, COERequest, OTRequest, OTStatus } from '../types';

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

    const filterTicketsByScope = (data: Ticket[]): Ticket[] => {
        const user = getCurrentUser();
        if (!user) return [];
        const visibleIds = getVisibleEmployeeIds();

        return data.filter(item => 
            visibleIds.includes(item.requesterId) || item.assignedToId === user.id
        );
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


    return { can, getVisibleEmployeeIds, filterByScope, filterIncidentReportsByScope, filterTicketsByScope, hasDirectReports, getAccessibleBusinessUnits, isUserEligibleEvaluator, getCoeAccess, getOtAccess };
};
