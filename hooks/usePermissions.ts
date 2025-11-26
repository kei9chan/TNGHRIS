
import { useAuth } from './useAuth';
import { useSettings } from '../context/SettingsContext';
import { mockPermissions, mockUsers, mockBusinessUnits, mockDepartments } from '../services/mockData';
import { Resource, Permission, Role, IncidentReport, Ticket, BusinessUnit, Evaluation, EvaluatorType, User } from '../types';

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


    return { can, getVisibleEmployeeIds, filterByScope, filterIncidentReportsByScope, filterTicketsByScope, hasDirectReports, getAccessibleBusinessUnits, isUserEligibleEvaluator };
};
