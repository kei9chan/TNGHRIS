









import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import { useAuth } from './hooks/useAuth';
import { usePermissions } from './hooks/usePermissions';
import { usePermissionsContext } from './context/PermissionsContext';
import { Permission, Resource } from './types';
import Layout from './components/layout/Layout';
const Login = React.lazy(() => import('./pages/Login'));
const SignUp = React.lazy(() => import('./pages/SignUp'));
const RegistrationSuccess = React.lazy(() => import('./pages/RegistrationSuccess'));
const ForgotPassword = React.lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = React.lazy(() => import('./pages/ResetPassword'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const NotFound = React.lazy(() => import('./pages/NotFound'));
const Notifications = React.lazy(() => import('./pages/Notifications'));

// New Employee Pages
const EmployeeList = React.lazy(() => import('./pages/employees/EmployeeList'));
const EmployeeProfile = React.lazy(() => import('./pages/employees/EmployeeProfile'));
const PersonnelActionNotice = React.lazy(() => import('./pages/employees/PersonnelActionNotice'));
const OnboardingChecklist = React.lazy(() => import('./pages/employees/OnboardingChecklist'));
const OnboardingPreviewPage = React.lazy(() => import('./pages/employees/OnboardingPreviewPage'));
const OnboardingTaskPage = React.lazy(() => import('./pages/employees/OnboardingTaskPage'));
const OnboardingSignPage = React.lazy(() => import('./pages/employees/OnboardingSignPage'));
const OnboardingViewPage = React.lazy(() => import('./pages/employees/OnboardingViewPage'));
const Contracts = React.lazy(() => import('./pages/employees/Contracts'));
const Benefits = React.lazy(() => import('./pages/employees/Benefits'));
import { F_CLOCK_ADMIN_AUDIT_UI } from './constants';
const DisciplinaryCases = React.lazy(() => import('./pages/feedback/DisciplinaryCases'));
const NTEDetail = React.lazy(() => import('./pages/feedback/NTEDetail'));
const CoachingLog = React.lazy(() => import('./pages/feedback/CoachingLog'));
const MemoLibrary = React.lazy(() => import('./pages/feedback/MemoLibrary'));
const CodeOfDiscipline = React.lazy(() => import('./pages/feedback/CodeOfDiscipline'));
const Pipeline = React.lazy(() => import('./pages/feedback/Pipeline'));
const MyIncidentReports = React.lazy(() => import('./pages/feedback/MyIncidentReports'));
const MyNTEs = React.lazy(() => import('./pages/feedback/MyNTEs'));
const Timekeeping = React.lazy(() => import('./pages/payroll/Timekeeping'));
const ClockInOut = React.lazy(() => import('./pages/payroll/ClockInOut'));
const ClockLog = React.lazy(() => import('./pages/payroll/ClockLog'));
const OvertimeRequests = React.lazy(() => import('./pages/payroll/OvertimeRequests'));
import WFHRequests from './pages/payroll/WFHRequests'; // NEW
const Leave = React.lazy(() => import('./pages/payroll/Leave'));
const LeaveCredits = React.lazy(() => import('./pages/payroll/LeaveCredits'));
const Loans = React.lazy(() => import('./pages/payroll/Loans'));
const PayrollPrep = React.lazy(() => import('./pages/payroll/PayrollPrep'));
const AttendanceExceptions = React.lazy(() => import('./pages/payroll/AttendanceExceptions'));
const PayrollReports = React.lazy(() => import('./pages/payroll/PayrollReports'));
const DailyTimeSummary = React.lazy(() => import('./pages/payroll/reports/DailyTimeSummary'));
const ExceptionsReport = React.lazy(() => import('./pages/payroll/reports/ExceptionsReport'));
const PayrollStaging = React.lazy(() => import('./pages/payroll/PayrollStaging'));
const Payslips = React.lazy(() => import('./pages/payroll/Payslips'));
const GovernmentReports = React.lazy(() => import('./pages/payroll/GovernmentReports'));
const GovernmentReportDetail = React.lazy(() => import('./pages/payroll/reports/GovernmentReportDetail'));
const GovernmentReportTemplates = React.lazy(() => import('./pages/payroll/GovernmentReportTemplates'));
const FinalPayCalculator = React.lazy(() => import('./pages/payroll/FinalPayCalculator'));
const PayrollConfiguration = React.lazy(() => import('./pages/payroll/PayrollConfiguration'));
const Evaluations = React.lazy(() => import('./pages/evaluation/Evaluations'));
const NewEvaluation = React.lazy(() => import('./pages/evaluation/NewEvaluation'));
const QuestionBank = React.lazy(() => import('./pages/evaluation/QuestionBank'));
const QuestionSetDetail = React.lazy(() => import('./pages/evaluation/QuestionSetDetail'));
const PerformEvaluation = React.lazy(() => import('./pages/evaluation/PerformEvaluation'));
const EvaluationResult = React.lazy(() => import('./pages/evaluation/EvaluationResult'));
const Timelines = React.lazy(() => import('./pages/evaluation/Timelines'));
const Awards = React.lazy(() => import('./pages/evaluation/Awards'));
const EvaluationReports = React.lazy(() => import('./pages/evaluation/EvaluationReports'));
const PulseSurveys = React.lazy(() => import('./pages/evaluation/PulseSurveys'));
const PulseSurveyBuilder = React.lazy(() => import('./pages/evaluation/PulseSurveyBuilder'));
const PulseSurveyResults = React.lazy(() => import('./pages/evaluation/PulseSurveyResults'));
const TakePulseSurvey = React.lazy(() => import('./pages/evaluation/TakePulseSurvey'));
const Settings = React.lazy(() => import('./pages/admin/Settings'));
const AuditLog = React.lazy(() => import('./pages/admin/AuditLog'));
const RolesPermissions = React.lazy(() => import('./pages/admin/RolesPermissions'));
const UserManagement = React.lazy(() => import('./pages/admin/UserManagement'));
const HRReviewQueue = React.lazy(() => import('./pages/admin/HRReviewQueue'));
const LeavePolicies = React.lazy(() => import('./pages/admin/LeavePolicies'));
const SiteManagement = React.lazy(() => import('./pages/admin/SiteManagement'));
const Tickets = React.lazy(() => import('./pages/helpdesk/Tickets'));
const Announcements = React.lazy(() => import('./pages/helpdesk/Announcements'));
const Calendar = React.lazy(() => import('./pages/helpdesk/Calendar'));
const OrgChart = React.lazy(() => import('./pages/helpdesk/OrgChart'));
const EnvelopeDetail = React.lazy(() => import('./pages/employees/EnvelopeDetail'));
const SubmitResignation = React.lazy(() => import('./pages/employees/SubmitResignation'));
const KnowledgeBase = React.lazy(() => import('./pages/helpdesk/KnowledgeBase'));
const AssetManagement = React.lazy(() => import('./pages/employees/AssetManagement'));
const AssetRequests = React.lazy(() => import('./pages/employees/AssetRequests'));
const DailyTimeReview = React.lazy(() => import('./pages/payroll/DailyTimeReview'));
const Holidays = React.lazy(() => import('./pages/admin/Holidays'));
const WorkforcePlanning = React.lazy(() => import('./pages/admin/WorkforcePlanning'));
const ManpowerPlanning = React.lazy(() => import('./pages/payroll/ManpowerPlanning'));
import COETemplates from './pages/admin/COETemplates'; // NEW
import COERequests from './pages/admin/COERequests'; // NEW

// Recruitment Pages
const Requisitions = React.lazy(() => import('./pages/recruitment/Requisitions'));
const JobPosts = React.lazy(() => import('./pages/recruitment/JobPosts'));
const JobPostTemplates = React.lazy(() => import('./pages/recruitment/JobPostTemplates'));
const JobSocialMediaPostGenerator = React.lazy(() => import('./pages/recruitment/JobSocialMediaPostGenerator'));
const Applicants = React.lazy(() => import('./pages/recruitment/Applicants'));
const Candidates = React.lazy(() => import('./pages/recruitment/Candidates'));
const Interviews = React.lazy(() => import('./pages/recruitment/Interviews'));
const Offers = React.lazy(() => import('./pages/recruitment/Offers'));
const OfferTemplates = React.lazy(() => import('./pages/recruitment/OfferTemplates'));
const OfferResponse = React.lazy(() => import('./pages/OfferResponse'));
const FeedbackTemplates = React.lazy(() => import('./pages/feedback/FeedbackTemplates'));
const Apply = React.lazy(() => import('./pages/Apply'));
const ThankYou = React.lazy(() => import('./pages/ThankYou'));
const Departments = React.lazy(() => import('./pages/admin/Departments'));
const ApplicationPages = React.lazy(() => import('./pages/recruitment/ApplicationPages'));
const CareerPagePreview = React.lazy(() => import('./components/recruitment/CareerPagePreview'));
const OpenRolesPage = React.lazy(() => import('./components/recruitment/OpenRolesPage'));
const CareerRolePage = React.lazy(() => import('./components/recruitment/CareerRolePage'));
const CareerApplicationPage = React.lazy(() => import('./components/recruitment/CareerApplicationPage'));
const UserProfile = React.lazy(() => import('./pages/users/UserProfile'));

// Analytics Pages
const RecruitmentAnalytics = React.lazy(() => import('./pages/analytics/RecruitmentAnalytics'));
const EmployeeAnalytics = React.lazy(() => import('./pages/analytics/EmployeeAnalytics'));
const DisciplineAnalytics = React.lazy(() => import('./pages/analytics/DisciplineAnalytics'));

// Workflows
import { autoCelebrateBirthdays } from './services/workflows';


const ProtectedRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { user, loading } = useAuth();
  const { can } = usePermissions();
  const { loadingPermissions, authorizationError } = usePermissionsContext();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (loadingPermissions) {
    return (
      <div className="flex items-center justify-center h-screen" aria-label="Loading authorization">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (authorizationError) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <div className="max-w-lg rounded-xl border border-red-200 bg-white p-6 shadow-lg">
          <h1 className="text-xl font-bold text-red-700">Authorization unavailable</h1>
          <p className="mt-2 text-gray-700">{authorizationError}</p>
          <p className="mt-3 text-sm text-gray-500">Access is fail-closed. Contact an administrator and provide this message.</p>
        </div>
      </div>
    );
  }

  const routePermissions: Array<[string, Resource, Permission]> = [
    ['/admin/roles', 'RolesPermissions' as Resource, Permission.View],
    ['/admin/users', 'UserManagement' as Resource, Permission.View],
    ['/admin/departments', 'Departments', Permission.View],
    ['/admin/sites', 'Sites', Permission.View],
    ['/admin/leave-policies', 'LeavePolicies', Permission.View],
    ['/admin/holidays', 'Holidays', Permission.View],
    ['/admin/audit-log', 'AuditLog', Permission.View],
    ['/admin/settings', 'SystemSettings' as Resource, Permission.View],
    ['/recruitment/requisitions', 'JobRequisitions' as Resource, Permission.View],
    ['/recruitment/job-post-templates', 'JobPosts', Permission.Manage],
    ['/recruitment/job-social-media-generator', 'JobPosts', Permission.Manage],
    ['/recruitment/job-post', 'JobPosts', Permission.View],
    ['/recruitment/application-pages', 'ApplicationPages', Permission.View],
    ['/recruitment/applicants', 'Applicants', Permission.View],
    ['/recruitment/candidates', 'Candidates', Permission.View],
    ['/recruitment/interviews', 'Interviews', Permission.View],
    ['/recruitment/offer', 'Offers', Permission.View],
    ['/employees/list', 'EmployeeList' as Resource, Permission.View],
    ['/employees/view', 'EmployeeProfile' as Resource, Permission.View],
    ['/employees/pan', 'PersonnelActionNotices' as Resource, Permission.View],
    ['/employees/onboarding', 'Onboarding' as Resource, Permission.View],
    ['/employees/contracts', 'ContractsSigning' as Resource, Permission.View],
    ['/employees/coe', 'CertificateEmployment' as Resource, Permission.View],
    ['/employees/benefits', 'Benefits', Permission.View],
    ['/employees/asset-management/asset-requests', 'AssetRequests', Permission.View],
    ['/employees/asset-management', 'Assets', Permission.View],
    ['/employees/analytics', 'EmployeeAnalytics' as Resource, Permission.View],
    ['/feedback', 'Feedback', Permission.View],
    ['/payroll/timekeeping', 'Timekeeping', Permission.View],
    ['/payroll/daily-review', 'DailyTimeReview', Permission.View],
    ['/payroll/clock-in-out', 'ClockInOut' as Resource, Permission.View],
    ['/payroll/clock-log', 'ClockLogs' as Resource, Permission.View],
    ['/payroll/overtime', 'Overtime' as Resource, Permission.View],
    ['/payroll/wfh', 'WorkFromHome' as Resource, Permission.View],
    ['/payroll/leave', 'Leave', Permission.View],
    ['/payroll/manpower', 'ManpowerPlanning' as Resource, Permission.View],
    ['/payroll/workforce-planning', 'WorkforcePlanning', Permission.View],
    ['/payroll/exceptions', 'AttendanceExceptions' as Resource, Permission.View],
    ['/payroll/payroll-prep', 'PayrollPreparation' as Resource, Permission.View],
    ['/payroll/staging', 'PayrollStaging' as Resource, Permission.View],
    ['/payroll/government-reports', 'GovernmentReports', Permission.View],
    ['/payroll/payslips', 'Payslips', Permission.View],
    ['/payroll/final-pay', 'FinalPay', Permission.View],
    ['/payroll/configuration', 'PayrollConfiguration' as Resource, Permission.View],
    ['/payroll/reports', 'PayrollReports' as Resource, Permission.View],
    ['/payroll', 'Payroll', Permission.View],
    ['/evaluation', 'Evaluation', Permission.View],
    ['/helpdesk', 'Helpdesk', Permission.View],
    ['/dashboard', 'Dashboard', Permission.View],
  ];
  const required = routePermissions.find(([prefix]) => location.pathname.startsWith(prefix));
  if (required && !can(required[1], required[2])) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-lg rounded-xl border border-amber-200 bg-white p-6 text-center shadow">
          <h1 className="text-xl font-bold text-gray-900">Access denied</h1>
          <p className="mt-2 text-gray-600">You do not have {required[2]} access to {required[1]}.</p>
          <button className="mt-4 text-indigo-600 font-semibold" onClick={() => window.history.back()}>Go back</button>
        </div>
      </div>
    );
  }

  return children;
};

const AppRoutes: React.FC = () => {
  return (
    <React.Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div></div>}>
      <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/registration-success" element={<RegistrationSuccess />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/apply" element={<Apply />} />
      <Route path="/apply/:jobPostId/:jobSlug?" element={<Apply />} />
      <Route path="/offer/:token" element={<OfferResponse />} />
        <Route path="/thank-you" element={<ThankYou />} />
        {/* Public Career Pages */}
        <Route path="/careers/:slug/apply/:roleSlug" element={<CareerApplicationPage />} />
        <Route path="/careers/:slug/apply" element={<CareerApplicationPage />} />
        <Route path="/careers/:slug/roles/:roleSlug" element={<CareerRolePage />} />
        <Route path="/careers/:slug/:subpage" element={<OpenRolesPage />} />
        <Route path="/careers/:slug" element={<CareerPagePreview isPublic={true} />} />
      
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="my-profile" element={<ProtectedRoute><EmployeeProfile/></ProtectedRoute>} />
        <Route path="notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
        <Route path="users/:userId" element={<ProtectedRoute><UserProfile /></ProtectedRoute>} />
        <Route path="submit-resignation" element={<ProtectedRoute><SubmitResignation /></ProtectedRoute>} />
        
        <Route path="employees" element={<Outlet />}>
            <Route index element={<Navigate to="list" replace />} />
            <Route path="list" element={<ProtectedRoute><EmployeeList/></ProtectedRoute>} />
            <Route path="view/:employeeId" element={<ProtectedRoute><EmployeeProfile/></ProtectedRoute>} />
            <Route path="pan" element={<ProtectedRoute><PersonnelActionNotice/></ProtectedRoute>} />
            <Route path="onboarding" element={<ProtectedRoute><OnboardingChecklist/></ProtectedRoute>} />
            <Route path="onboarding/preview/:templateId" element={<ProtectedRoute><OnboardingPreviewPage/></ProtectedRoute>} />
            <Route path="onboarding/task/:taskId" element={<ProtectedRoute><OnboardingTaskPage/></ProtectedRoute>} />
            <Route path="onboarding/sign/:checklistId" element={<ProtectedRoute><OnboardingSignPage /></ProtectedRoute>} />
            <Route path="onboarding/view/:checklistId" element={<ProtectedRoute><OnboardingViewPage /></ProtectedRoute>} />
            <Route path="contracts" element={<ProtectedRoute><Contracts/></ProtectedRoute>} />
            <Route path="contracts/:envelopeId" element={<ProtectedRoute><EnvelopeDetail /></ProtectedRoute>} />
            <Route path="benefits" element={<ProtectedRoute><Benefits /></ProtectedRoute>} />
            
            {/* NEW COE SUBMENU */}
            <Route path="coe" element={<Outlet />}>
                 <Route index element={<Navigate to="requests" replace />} />
                 <Route path="requests" element={<ProtectedRoute><COERequests /></ProtectedRoute>} />
                 <Route path="templates" element={<ProtectedRoute><COETemplates /></ProtectedRoute>} />
            </Route>

            <Route path="asset-management" element={<Outlet />}>
                <Route index element={<Navigate to="assets" replace />} />
                <Route path="assets" element={<ProtectedRoute><AssetManagement /></ProtectedRoute>} />
                <Route path="asset-requests" element={<ProtectedRoute><AssetRequests /></ProtectedRoute>} />
            </Route>
            <Route path="analytics" element={<Outlet />}>
              <Route index element={<Navigate to="recruitment" replace />} />
              <Route path="recruitment" element={<ProtectedRoute><RecruitmentAnalytics /></ProtectedRoute>} />
              <Route path="employee" element={<ProtectedRoute><EmployeeAnalytics /></ProtectedRoute>} />
              <Route path="discipline" element={<ProtectedRoute><DisciplineAnalytics /></ProtectedRoute>} />
            </Route>
        </Route>

        {/* Feedback Section */}
        <Route path="feedback" element={<Outlet />}>
             <Route index element={<Navigate to="cases" replace />} />
             <Route path="cases" element={<ProtectedRoute><DisciplinaryCases /></ProtectedRoute>} />
             <Route path="coaching" element={<ProtectedRoute><CoachingLog /></ProtectedRoute>} />
             <Route path="nte/:nteId" element={<ProtectedRoute><NTEDetail /></ProtectedRoute>} />
             <Route path="memos" element={<ProtectedRoute><MemoLibrary /></ProtectedRoute>} />
             <Route path="discipline" element={<ProtectedRoute><CodeOfDiscipline /></ProtectedRoute>} />
             <Route path="templates" element={<ProtectedRoute><FeedbackTemplates /></ProtectedRoute>} />
             <Route path="pipeline" element={<ProtectedRoute><Pipeline /></ProtectedRoute>} />
             <Route path="my-irs" element={<ProtectedRoute><MyIncidentReports /></ProtectedRoute>} />
             <Route path="my-ntes" element={<ProtectedRoute><MyNTEs /></ProtectedRoute>} />
        </Route>

        {/* Payroll Section */}
        <Route path="payroll" element={<Outlet />}>
            <Route index element={<Navigate to="timekeeping" replace />} />
            <Route path="timekeeping" element={<ProtectedRoute><Timekeeping /></ProtectedRoute>} />
            <Route path="manpower-planning" element={<ProtectedRoute><ManpowerPlanning /></ProtectedRoute>} />
            <Route path="workforce-planning" element={<ProtectedRoute><WorkforcePlanning /></ProtectedRoute>} />
             <Route path="daily-review" element={<ProtectedRoute><DailyTimeReview /></ProtectedRoute>} />
            <Route path="clock-in-out" element={<ProtectedRoute><ClockInOut /></ProtectedRoute>} />
            <Route path="clock-log" element={<ProtectedRoute><ClockLog /></ProtectedRoute>} />
            <Route path="overtime-requests" element={<ProtectedRoute><OvertimeRequests /></ProtectedRoute>} />
            {/* Redirect legacy notification links that used the old path */}
            <Route path="overtime" element={<Navigate to="/payroll/overtime-requests" replace />} />
            <Route path="wfh-requests" element={<ProtectedRoute><WFHRequests /></ProtectedRoute>} /> {/* NEW */}
            <Route path="leave" element={<ProtectedRoute><Leave /></ProtectedRoute>} />
            <Route path="leave-credits" element={<ProtectedRoute><LeaveCredits /></ProtectedRoute>} />
            <Route path="loans" element={<ProtectedRoute><Loans /></ProtectedRoute>} />
            <Route path="payroll-prep" element={<ProtectedRoute><PayrollPrep /></ProtectedRoute>} />
            <Route path="exceptions" element={<ProtectedRoute><AttendanceExceptions /></ProtectedRoute>} />
            <Route path="reports" element={<ProtectedRoute><PayrollReports /></ProtectedRoute>} />
            <Route path="reports/time-summary" element={<ProtectedRoute><DailyTimeSummary /></ProtectedRoute>} />
            <Route path="reports/exceptions" element={<ProtectedRoute><ExceptionsReport /></ProtectedRoute>} />
            <Route path="staging" element={<ProtectedRoute><PayrollStaging /></ProtectedRoute>} />
            <Route path="payslips" element={<ProtectedRoute><Payslips /></ProtectedRoute>} />
            <Route path="government-reports" element={<ProtectedRoute><GovernmentReports /></ProtectedRoute>} />
            <Route path="government-reports/:reportId" element={<ProtectedRoute><GovernmentReportDetail /></ProtectedRoute>} />
            <Route path="report-templates" element={<ProtectedRoute><GovernmentReportTemplates /></ProtectedRoute>} />
            <Route path="final-pay" element={<ProtectedRoute><FinalPayCalculator /></ProtectedRoute>} />
            <Route path="configuration" element={<ProtectedRoute><PayrollConfiguration /></ProtectedRoute>} />
        </Route>

        {/* Evaluation Section */}
        <Route path="evaluation" element={<Outlet />}>
             <Route index element={<Navigate to="reviews" replace />} />
             <Route path="reviews" element={<ProtectedRoute><Evaluations /></ProtectedRoute>} />
             <Route path="pulse" element={<ProtectedRoute><PulseSurveys /></ProtectedRoute>} />
             <Route path="pulse/new" element={<ProtectedRoute><PulseSurveyBuilder /></ProtectedRoute>} />
             <Route path="pulse/edit/:surveyId" element={<ProtectedRoute><PulseSurveyBuilder /></ProtectedRoute>} />
             <Route path="pulse/results/:surveyId" element={<ProtectedRoute><PulseSurveyResults /></ProtectedRoute>} />
             <Route path="pulse/take/:surveyId" element={<ProtectedRoute><TakePulseSurvey /></ProtectedRoute>} />
             <Route path="new" element={<ProtectedRoute><NewEvaluation /></ProtectedRoute>} />
             <Route path="question-bank" element={<ProtectedRoute><QuestionBank /></ProtectedRoute>} />
             <Route path="question-bank/:setId" element={<ProtectedRoute><QuestionSetDetail /></ProtectedRoute>} />
             <Route path="perform/:evaluationId" element={<ProtectedRoute><PerformEvaluation /></ProtectedRoute>} />
             <Route path="report/:evaluationId" element={<ProtectedRoute><EvaluationResult /></ProtectedRoute>} />
             <Route path="timelines" element={<ProtectedRoute><Timelines /></ProtectedRoute>} />
             <Route path="awards" element={<ProtectedRoute><Awards /></ProtectedRoute>} />
             <Route path="reports" element={<ProtectedRoute><EvaluationReports /></ProtectedRoute>} />
        </Route>

        {/* Admin Section */}
        <Route path="admin" element={<Outlet />}>
             <Route index element={<Navigate to="roles" replace />} />
             <Route path="roles" element={<ProtectedRoute><RolesPermissions /></ProtectedRoute>} />
             <Route path="users" element={<ProtectedRoute><UserManagement /></ProtectedRoute>} />
             <Route path="departments" element={<ProtectedRoute><Departments /></ProtectedRoute>} />
             <Route path="sites" element={<ProtectedRoute><SiteManagement /></ProtectedRoute>} />
             <Route path="leave-policies" element={<ProtectedRoute><LeavePolicies /></ProtectedRoute>} />
             <Route path="holidays" element={<ProtectedRoute><Holidays /></ProtectedRoute>} />
             <Route path="audit-log" element={<ProtectedRoute><AuditLog /></ProtectedRoute>} />
             <Route path="settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        </Route>

        {/* Helpdesk Section */}
        <Route path="helpdesk" element={<Outlet />}>
             <Route index element={<Navigate to="tickets" replace />} />
             <Route path="tickets" element={<ProtectedRoute><Tickets /></ProtectedRoute>} />
             <Route path="announcements" element={<ProtectedRoute><Announcements /></ProtectedRoute>} />
             <Route path="calendar" element={<ProtectedRoute><Calendar /></ProtectedRoute>} />
             <Route path="org-chart" element={<ProtectedRoute><OrgChart /></ProtectedRoute>} />
             <Route path="knowledge-base" element={<ProtectedRoute><KnowledgeBase /></ProtectedRoute>} />
        </Route>
        
        {/* Recruitment Section */}
        <Route path="recruitment" element={<Outlet />}>
             <Route index element={<Navigate to="requisitions" replace />} />
             <Route path="requisitions" element={<ProtectedRoute><Requisitions /></ProtectedRoute>} />
             <Route path="job-posts" element={<ProtectedRoute><JobPosts /></ProtectedRoute>} />
             <Route path="job-post-templates" element={<ProtectedRoute><JobPostTemplates /></ProtectedRoute>} />
             <Route path="job-social-media-generator" element={<ProtectedRoute><JobSocialMediaPostGenerator /></ProtectedRoute>} />
             <Route path="application-pages" element={<ProtectedRoute><ApplicationPages /></ProtectedRoute>} />
             <Route path="applicants" element={<ProtectedRoute><Applicants /></ProtectedRoute>} />
             <Route path="candidates" element={<ProtectedRoute><Candidates /></ProtectedRoute>} />
             <Route path="interviews" element={<ProtectedRoute><Interviews /></ProtectedRoute>} />
             <Route path="offers" element={<ProtectedRoute><Offers /></ProtectedRoute>} />
             <Route path="offer-templates" element={<ProtectedRoute><OfferTemplates /></ProtectedRoute>} />
        </Route>

      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
    </React.Suspense>
  );
};

import { PermissionsProvider } from './context/PermissionsContext';

const App: React.FC = () => {
  return (
    <AuthProvider>
      <SettingsProvider>
        <PermissionsProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </PermissionsProvider>
      </SettingsProvider>
    </AuthProvider>
  );
};

export default App;
