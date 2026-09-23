// Staff money screens are isolated from employee clock/leave/OT/WFH routes.
// These prototype components must not mount before the payroll engine is ready.
export const isStaffPayrollRoute = (path: string) =>
  /^\/payroll\/(payroll-prep|staging|payslips|my-issues|government-reports|report-templates|final-pay|configuration)(\/|$)/.test(path);
export const isPayrollAccessRoute = (path: string) => path.startsWith('/payroll/import/') || ['/payroll/run','/payroll/import-attendance','/payroll/historical-reconciliation','/payroll/historical-attendance', '/payroll/historical-corrections', '/payroll/home', '/payroll/access', '/payroll/pay-packages', '/payroll/attendance-readiness', '/payroll/gross-pay', '/payroll/net-pay'].includes(path);
