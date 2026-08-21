import { useContext, useMemo } from 'react';
import { PermissionsContext } from '../context/PermissionsContext';
import { useAuth } from './useAuth';
import {
  COERequest,
  Evaluation,
  EvaluatorType,
  IncidentReport,
  OTRequest,
  OTStatus,
  Permission,
  Ticket,
  User,
} from '../types';
import { allowedBusinessUnitIds, normalizeAccessScope } from '../services/rbac';

export const usePermissions = () => {
  const context = useContext(PermissionsContext);
  const { user } = useAuth();
  if (!context) throw new Error('usePermissions must be used within PermissionsProvider');

  return useMemo(() => {
    const scope = normalizeAccessScope(user?.accessScope);
    const allowedBuIds = allowedBusinessUnitIds(scope, user?.businessUnitId);
    const isGlobal = allowedBuIds === null;
    const scopeName = isGlobal ? 'global' : scope.type === 'HOME_ONLY' ? 'self' : 'bu';
    const can = context.can;

    const getVisibleEmployeeIds = (): string[] => (isGlobal ? [] : user ? [user.id] : []);
    const hasDirectReports = () =>
      can('Employees', Permission.Approve) ||
      can('OT', Permission.Approve) ||
      can('Leave', Permission.Approve);

    const filterByScope = <T extends { employeeId: string }>(rows: T[]): T[] =>
      isGlobal ? rows : rows.filter(row => row.employeeId === user?.id);

    const filterIncidentReportsByScope = (rows: IncidentReport[]) =>
      isGlobal
        ? rows
        : rows.filter(row => user && row.involvedEmployeeIds.includes(user.id));

    const getTicketAccess = () => ({
      canSubmit: can('Helpdesk', Permission.Create),
      canRespond: can('Helpdesk', Permission.Edit) || can('Helpdesk', Permission.Approve),
      canView: can('Helpdesk', Permission.View),
      scope: scopeName as 'global' | 'bu' | 'self',
    });

    const filterTicketsByScope = (rows: Ticket[]) => {
      const access = getTicketAccess();
      if (!access.canView || !user) return [];
      if (isGlobal) return rows;
      const allowed = new Set(allowedBuIds || []);
      return rows.filter(
        row =>
          row.requesterId === user.id ||
          row.assignedToId === user.id ||
          (!!row.businessUnitId && allowed.has(row.businessUnitId)),
      );
    };

    const isUserEligibleEvaluator = (
      evaluator: User,
      evaluation: Evaluation,
      subjectId: string,
    ): boolean =>
      evaluation.evaluators.some(config => {
        if (config.type === EvaluatorType.Individual) return config.userId === evaluator.id;
        if (config.type !== EvaluatorType.Group || !config.groupFilter) return false;
        if (config.excludeSubject && evaluator.id === subjectId) return false;
        if (
          config.groupFilter.businessUnitId &&
          evaluator.businessUnitId !== config.groupFilter.businessUnitId
        ) return false;
        if (
          config.groupFilter.departmentId &&
          evaluator.departmentId !== config.groupFilter.departmentId
        ) return false;
        return true;
      });

    const filterRequests = <T extends { employeeId: string; businessUnitId?: string }>(
      rows: T[],
      canView: boolean,
    ) => {
      if (!canView || !user) return [];
      if (isGlobal) return rows;
      const allowed = new Set(allowedBuIds || []);
      return rows.filter(
        row => row.employeeId === user.id || (!!row.businessUnitId && allowed.has(row.businessUnitId)),
      );
    };

    const getCoeAccess = () => {
      const canRequest = can('COE', Permission.Create);
      const canApprove = can('COE', Permission.Approve) || can('COE', Permission.Manage);
      const canView = can('COE', Permission.View);
      const filter = (rows: COERequest[]) => filterRequests(rows, canView);
      return {
        canRequest,
        canApprove,
        canView,
        scope: scopeName,
        filterRequests: filter,
        canActOn: (request: COERequest) => canApprove && filter([request]).length > 0,
      };
    };

    const getOtAccess = () => {
      const canRequest = can('OT', Permission.Create);
      const canApprove = can('OT', Permission.Approve) || can('OT', Permission.Manage);
      const canView = can('OT', Permission.View);
      const filter = (rows: OTRequest[]) => filterRequests(rows, canView);
      return {
        canRequest,
        canApprove,
        canView,
        scope: scopeName,
        filterRequests: filter,
        canActOn: (request: OTRequest) =>
          canApprove &&
          request.status !== OTStatus.Approved &&
          request.status !== OTStatus.Rejected &&
          filter([request]).length > 0,
      };
    };

    const getIrAccess = () => ({
      canCreate: can('Feedback', Permission.Create),
      canView: can('Feedback', Permission.View),
      scope: scopeName,
    });
    const getAwardsAccess = () => ({
      canAssign: can('Evaluation', Permission.Create),
      canApprove: can('Evaluation', Permission.Approve),
      canView: can('Evaluation', Permission.View),
      scope: scopeName,
    });
    const getPanAccess = () => ({
      canView: can('PAN', Permission.View),
      canRespond: can('PAN', Permission.Edit) || can('PAN', Permission.Approve),
      canCreate: can('PAN', Permission.Create),
      scope: scopeName,
    });
    const getJobRequisitionAccess = () => ({
      canCreate: can('Requisitions', Permission.Create),
      canView: can('Requisitions', Permission.View),
      scope: scopeName,
    });
    const getAnnouncementAccess = () => ({
      canView: can('Announcements', Permission.View),
      canManage: can('Announcements', Permission.Manage),
      scope: scopeName,
    });
    const getLifecycleAccess = () => ({
      canView: can('Lifecycle', Permission.View),
      canManage: can('Lifecycle', Permission.Manage),
      scope: scopeName,
    });

    return {
      ...context,
      can,
      isSuperAdmin: () => user?.role === 'Admin',
      getVisibleEmployeeIds,
      filterByScope,
      filterIncidentReportsByScope,
      filterTicketsByScope,
      hasDirectReports,
      isUserEligibleEvaluator,
      getCoeAccess,
      getOtAccess,
      getTicketAccess,
      getIrAccess,
      getJobRequisitionAccess,
      getAnnouncementAccess,
      getAwardsAccess,
      getPanAccess,
      getLifecycleAccess,
    };
  }, [context, user]);
};
