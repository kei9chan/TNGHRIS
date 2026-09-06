// Staff money screens are isolated from employee clock/leave/OT/WFH routes.
// These prototype components must not mount before the payroll engine is ready.
export const isStaffPayrollRoute = (path: string) =>
  /^\/payroll\/(payroll-prep|staging|payslips|government-reports|report-templates|final-pay|configuration)(\/|$)/.test(path);
export const isPayrollAccessRoute = (path: string) => path === '/payroll/access' || path === '/payroll/pay-packages';
