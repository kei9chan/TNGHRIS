import type { User } from '../types';

const normalize = (value?: string) => (value || '').trim().toLowerCase();
export const isActiveAwardRecipient = (employee: Pick<User, 'status' | 'employmentStatus'>) =>
  normalize(employee.status) === 'active'
  && !['resigned', 'terminated', 'separated', 'inactive'].includes(normalize(employee.employmentStatus));

export function awardRecipients(people: User[], businessUnitId: string, departmentId: string) {
  if (!businessUnitId) return [];
  return people.filter(employee => isActiveAwardRecipient(employee)
    && employee.businessUnitId === businessUnitId
    && (!departmentId || employee.departmentId === departmentId));
}

export function awardConfirmation(selected: number, total: number, businessUnit: string) {
  const excluded = total - selected;
  return `This award will be assigned to ${selected} active employee${selected === 1 ? '' : 's'} under ${businessUnit}. ${excluded} employee${excluded === 1 ? ' has' : 's have'} been excluded. Do you want to continue?`;
}
