import { Role, User } from '../types';

/**
 * Roles that may inspect evaluation cycles and results without being assigned
 * as an evaluator. The role list comes from the server-resolved HRIS user
 * record, so this helper is only a UI parity check; Supabase RLS remains the
 * authoritative data boundary.
 */
const EVALUATION_OVERSIGHT_ROLES: Role[] = [
  Role.Admin,
  Role.BOD,
  Role.HRManager,
  Role.HRStaff,
];

export const hasEvaluationOversightAccess = (
  user: Pick<User, 'role' | 'roles'> | null | undefined,
): boolean => {
  if (!user) return false;
  const roles = user.roles && user.roles.length > 0 ? user.roles : [user.role];
  return roles.some(role => EVALUATION_OVERSIGHT_ROLES.includes(role));
};

export const isEvaluationSubject = (
  userId: string | null | undefined,
  targetEmployeeIds: string[] | null | undefined,
): boolean => Boolean(userId && (targetEmployeeIds || []).includes(userId));
