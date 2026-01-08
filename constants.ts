
import { NavLink, Permission, Resource } from './types';

// Feature Flags
export const F_CLOCK_ADMIN_AUDIT_UI = true; // Set to false by default in production
export const F_SELF_SERVICE_ENABLED = true;


// File Uploader Constants
export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
export const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
export const ALLOWED_FILE_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.docx', '.xlsx'];

// Currency List
export const CURRENCIES = [
  { code: 'PHP', name: 'Philippine Peso' },
  { code: 'USD', name: 'United States Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'GBP', name: 'British Pound Sterling' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'HKD', name: 'Hong Kong Dollar' },
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'BRL', name: 'Brazilian Real' },
  { code: 'RUB', name: 'Russian Ruble' },
  { code: 'KRW', name: 'South Korean Won' },
  { code: 'MXN', name: 'Mexican Peso' },
  { code: 'IDR', name: 'Indonesian Rupiah' },
  { code: 'THB', name: 'Thai Baht' },
  { code: 'VND', name: 'Vietnamese Dong' },
  { code: 'MYR', name: 'Malaysian Ringgit' },
];


// Navigation Links
export const NAV_LINKS: NavLink[] = [
    {
        name: 'Dashboard',
        path: '/dashboard',
        requiredPermission: { resource: 'Dashboard', permission: Permission.View }
    },
    {
        name: 'Employees',
        path: '/employees/list', // Default path for parent
        requiredPermission: { resource: 'Employees', permission: Permission.View },
        children: [
            { name: 'Employee List', path: '/employees/list', requiredPermission: { resource: 'Employees', permission: Permission.View } },
            { name: 'Personnel Action Notice', path: '/employees/pan', requiredPermission: { resource: 'PAN', permission: Permission.View } },
            { name: 'Employee Lifecycle', path: '/employees/onboarding', requiredPermission: { resource: 'Lifecycle', permission: Permission.View } },
            { 
                name: 'COE', 
                path: '/employees/coe/requests', 
                requiredPermission: { resource: 'COE', permission: Permission.View },
                children: [
                    { name: 'Requests', path: '/employees/coe/requests', requiredPermission: { resource: 'COE', permission: Permission.View } },
                    { name: 'Templates', path: '/employees/coe/templates', requiredPermission: { resource: 'COE', permission: Permission.Manage } }
                ]
            },
            { name: 'Contracts & Signing', path: '/employees/contracts', requiredPermission: { resource: 'Employees', permission: Permission.View } },
            { name: 'Benefits', path: '/employees/benefits', requiredPermission: { resource: 'Benefits', permission: Permission.View } },
            { 
                name: 'Asset Management', 
                path: '/employees/asset-management/assets', // Default path for parent
                requiredPermission: { resource: 'Assets', permission: Permission.View },
                children: [
                    { name: 'Assets', path: '/employees/asset-management/assets', requiredPermission: { resource: 'Assets', permission: Permission.View } },
                    { name: 'Asset Requests', path: '/employees/asset-management/asset-requests', requiredPermission: { resource: 'AssetRequests', permission: Permission.View } }
                ]
            },
            { name: 'Analytics', path: '/employees/analytics', requiredPermission: { resource: 'Analytics', permission: Permission.View } },
        ]
    },
    {
        name: 'Feedback',
        path: '/feedback/cases',
        requiredPermission: { resource: 'Feedback', permission: Permission.View },
        children: [
            { name: 'Disciplinary Cases', path: '/feedback/cases', requiredPermission: { resource: 'Feedback', permission: Permission.View } },
            { name: 'Coaching Log', path: '/feedback/coaching', requiredPermission: { resource: 'Coaching', permission: Permission.View } },
            { name: 'Memo Library', path: '/feedback/memos', requiredPermission: { resource: 'MemoLibrary', permission: Permission.View } },
            { name: 'Code of Discipline', path: '/feedback/discipline', requiredPermission: { resource: 'CodeOfDiscipline', permission: Permission.View } },
            { name: 'Templates', path: '/feedback/templates', requiredPermission: { resource: 'FeedbackTemplates', permission: Permission.View } },
            { name: 'Pipeline', path: '/feedback/pipeline', requiredPermission: { resource: 'Pipeline', permission: Permission.View } },
        ]
    },
    {
        name: 'Payroll',
        path: '/payroll/timekeeping',
        requiredPermission: { resource: 'Timekeeping', permission: Permission.View },
        children: [
            { name: 'Timekeeping', path: '/payroll/timekeeping', requiredPermission: { resource: 'Timekeeping', permission: Permission.View } },
            { name: 'Manpower Planning', path: '/payroll/manpower-planning', requiredPermission: { resource: 'Manpower', permission: Permission.View } },
            { name: 'Workforce Planning', path: '/payroll/workforce-planning', requiredPermission: { resource: 'WorkforcePlanning', permission: Permission.Manage } },
            { name: 'Daily Time Review', path: '/payroll/daily-review', requiredPermission: { resource: 'Timekeeping', permission: Permission.View } },
            { name: 'Clock-in/Out', path: '/payroll/clock-in-out', requiredPermission: { resource: 'Clock', permission: Permission.View } },
            { name: 'Clock Log', path: '/payroll/clock-log', requiredPermission: { resource: 'ClockLog', permission: Permission.View } },
            { name: 'Overtime Requests', path: '/payroll/overtime-requests', requiredPermission: { resource: 'OT', permission: Permission.View } },
            { name: 'WFH Requests', path: '/payroll/wfh-requests', requiredPermission: { resource: 'WFH', permission: Permission.View } },
            { name: 'Leave', path: '/payroll/leave', requiredPermission: { resource: 'Leave', permission: Permission.View } },
            { name: 'Exceptions', path: '/payroll/exceptions', requiredPermission: { resource: 'Exceptions', permission: Permission.View } },
            { name: 'Payroll Prep', path: '/payroll/payroll-prep', requiredPermission: { resource: 'PayrollPrep', permission: Permission.View } },
            { name: 'Payroll Staging', path: '/payroll/staging', requiredPermission: { resource: 'PayrollStaging', permission: Permission.View } },
            // { name: 'Payslips', path: '/payroll/payslips', requiredPermission: { resource: 'Payslips', permission: Permission.View } }, // TEMPORARILY DISABLED
            { name: 'Government Reports', path: '/payroll/government-reports', requiredPermission: { resource: 'GovernmentReports', permission: Permission.View } },
            { name: 'Report Templates', path: '/payroll/report-templates', requiredPermission: { resource: 'ReportTemplates', permission: Permission.View } },
            { name: 'Loan Application System', path: '/payroll/loans', requiredPermission: { resource: 'Loans', permission: Permission.View } },
            { name: 'Final Pay Calculator', path: '/payroll/final-pay', requiredPermission: { resource: 'FinalPay', permission: Permission.View } },
            { name: 'Reports', path: '/payroll/reports', requiredPermission: { resource: 'Reports', permission: Permission.View } },
            { name: 'Configuration', path: '/payroll/configuration', requiredPermission: { resource: 'Settings', permission: Permission.Manage } },
        ]
    },
    {
        name: 'Evaluation',
        path: '/evaluation/reviews', // Default path for parent
        requiredPermission: { resource: 'Evaluation', permission: Permission.View },
        children: [
            { name: 'Evaluations', path: '/evaluation/reviews', requiredPermission: { resource: 'Evaluation', permission: Permission.View } },
            { name: 'Pulse Surveys', path: '/evaluation/pulse', requiredPermission: { resource: 'PulseSurvey', permission: Permission.View } },
            { name: 'New Evaluation', path: '/evaluation/new', requiredPermission: { resource: 'Evaluation', permission: Permission.Manage } },
            { name: 'Question Bank', path: '/evaluation/question-bank', requiredPermission: { resource: 'Evaluation', permission: Permission.Manage } },
            { name: 'Timelines', path: '/evaluation/timelines', requiredPermission: { resource: 'Evaluation', permission: Permission.Manage } },
            { name: 'Awards', path: '/evaluation/awards', requiredPermission: { resource: 'Evaluation', permission: Permission.Manage } },
            { name: 'Reports', path: '/evaluation/reports', requiredPermission: { resource: 'Evaluation', permission: Permission.View } },
        ]
    },
    {
        name: 'Recruitment',
        path: '/recruitment/requisitions',
        requiredPermission: { resource: 'Recruitment', permission: Permission.View },
        children: [
            { name: 'Requisitions', path: '/recruitment/requisitions', requiredPermission: { resource: 'Requisitions', permission: Permission.View } },
            { 
                name: 'Job Posts', 
                path: '/recruitment/job-posts',
                requiredPermission: { resource: 'JobPosts', permission: Permission.View },
                children: [
                    { name: 'Job Post Manager', path: '/recruitment/job-posts', requiredPermission: { resource: 'JobPosts', permission: Permission.View } },
                    { name: 'Job Post Templates', path: '/recruitment/job-post-templates', requiredPermission: { resource: 'JobPosts', permission: Permission.Manage } },
                ]
            },
            { name: 'Applicants', path: '/recruitment/applicants', requiredPermission: { resource: 'Applicants', permission: Permission.View } },
            { name: 'Candidates', path: '/recruitment/candidates', requiredPermission: { resource: 'Candidates', permission: Permission.View } },
            { name: 'Interviews', path: '/recruitment/interviews', requiredPermission: { resource: 'Interviews', permission: Permission.View } },
            { name: 'Offers', path: '/recruitment/offers', requiredPermission: { resource: 'Offers', permission: Permission.View } },
        ]
    },
    {
        name: 'Helpdesk',
        path: '/helpdesk/tickets',
        requiredPermission: { resource: 'Helpdesk', permission: Permission.View },
        children: [
            { name: 'Tickets', path: '/helpdesk/tickets', requiredPermission: { resource: 'Helpdesk', permission: Permission.View } },
            { name: 'Announcements', path: '/helpdesk/announcements', requiredPermission: { resource: 'Announcements', permission: Permission.View } },
            { name: 'Knowledge Base', path: '/helpdesk/knowledge-base', requiredPermission: { resource: 'Helpdesk', permission: Permission.View } },
            { name: 'Calendar', path: '/helpdesk/calendar', requiredPermission: { resource: 'Helpdesk', permission: Permission.View } },
            { name: 'Organizational Chart', path: '/helpdesk/org-chart', requiredPermission: { resource: 'Employees', permission: Permission.View } },
        ]
    },
    {
        name: 'Admin',
        path: '/admin/roles',
        requiredPermission: { resource: 'Settings', permission: Permission.View },
        children: [
            { name: 'Roles & Permissions', path: '/admin/roles', requiredPermission: { resource: 'Settings', permission: Permission.View } },
            { name: 'User Management', path: '/admin/users', requiredPermission: { resource: 'Settings', permission: Permission.Manage } },
            { name: 'Departments', path: '/admin/departments', requiredPermission: { resource: 'Departments', permission: Permission.Manage } },
            { name: 'Site Management', path: '/admin/sites', requiredPermission: { resource: 'Sites', permission: Permission.Manage } },
            { name: 'Leave Policies', path: '/admin/leave-policies', requiredPermission: { resource: 'LeavePolicies', permission: Permission.Manage } },
            { name: 'Holidays', path: '/admin/holidays', requiredPermission: { resource: 'Settings', permission: Permission.Manage } }, 
            { name: 'Audit Log', path: '/admin/audit-log', requiredPermission: { resource: 'AuditLog', permission: Permission.View } },
            { name: 'Settings', path: '/admin/settings', requiredPermission: { resource: 'Settings', permission: Permission.Manage } },
        ]
    }
];
