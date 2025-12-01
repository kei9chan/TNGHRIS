









import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import { useAuth } from './hooks/useAuth';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import Dashboard from './pages/Dashboard';
import NotFound from './pages/NotFound';

// New Employee Pages
import EmployeeList from './pages/employees/EmployeeList';
import EmployeeProfile from './pages/employees/EmployeeProfile';
import PersonnelActionNotice from './pages/employees/PersonnelActionNotice';
import OnboardingChecklist from './pages/employees/OnboardingChecklist';
import OnboardingPreviewPage from './pages/employees/OnboardingPreviewPage';
import OnboardingTaskPage from './pages/employees/OnboardingTaskPage';
import OnboardingSignPage from './pages/employees/OnboardingSignPage';
import OnboardingViewPage from './pages/employees/OnboardingViewPage';
import Contracts from './pages/employees/Contracts';
import Benefits from './pages/employees/Benefits';
import { F_CLOCK_ADMIN_AUDIT_UI } from './constants';
import DisciplinaryCases from './pages/feedback/DisciplinaryCases';
import NTEDetail from './pages/feedback/NTEDetail';
import CoachingLog from './pages/feedback/CoachingLog';
import MemoLibrary from './pages/feedback/MemoLibrary';
import CodeOfDiscipline from './pages/feedback/CodeOfDiscipline';
import Pipeline from './pages/feedback/Pipeline';
import Timekeeping from './pages/payroll/Timekeeping';
import ClockInOut from './pages/payroll/ClockInOut';
import ClockLog from './pages/payroll/ClockLog';
import OvertimeRequests from './pages/payroll/OvertimeRequests';
import WFHRequests from './pages/payroll/WFHRequests'; // NEW
import Leave from './pages/payroll/Leave';
import Loans from './pages/payroll/Loans';
import PayrollPrep from './pages/payroll/PayrollPrep';
import AttendanceExceptions from './pages/payroll/AttendanceExceptions';
import PayrollReports from './pages/payroll/PayrollReports';
import DailyTimeSummary from './pages/payroll/reports/DailyTimeSummary';
import ExceptionsReport from './pages/payroll/reports/ExceptionsReport';
import PayrollStaging from './pages/payroll/PayrollStaging';
import Payslips from './pages/payroll/Payslips';
import GovernmentReports from './pages/payroll/GovernmentReports';
import GovernmentReportDetail from './pages/payroll/reports/GovernmentReportDetail';
import GovernmentReportTemplates from './pages/payroll/GovernmentReportTemplates';
import FinalPayCalculator from './pages/payroll/FinalPayCalculator';
import PayrollConfiguration from './pages/payroll/PayrollConfiguration';
import Evaluations from './pages/evaluation/Evaluations';
import NewEvaluation from './pages/evaluation/NewEvaluation';
import QuestionBank from './pages/evaluation/QuestionBank';
import QuestionSetDetail from './pages/evaluation/QuestionSetDetail';
import PerformEvaluation from './pages/evaluation/PerformEvaluation';
import EvaluationResult from './pages/evaluation/EvaluationResult';
import Timelines from './pages/evaluation/Timelines';
import Awards from './pages/evaluation/Awards';
import EvaluationReports from './pages/evaluation/EvaluationReports';
import PulseSurveys from './pages/evaluation/PulseSurveys';
import PulseSurveyBuilder from './pages/evaluation/PulseSurveyBuilder';
import PulseSurveyResults from './pages/evaluation/PulseSurveyResults';
import TakePulseSurvey from './pages/evaluation/TakePulseSurvey';
import Settings from './pages/admin/Settings';
import AuditLog from './pages/admin/AuditLog';
import RolesPermissions from './pages/admin/RolesPermissions';
import UserManagement from './pages/admin/UserManagement';
import HRReviewQueue from './pages/admin/HRReviewQueue';
import LeavePolicies from './pages/admin/LeavePolicies';
import SiteManagement from './pages/admin/SiteManagement';
import Tickets from './pages/helpdesk/Tickets';
import Announcements from './pages/helpdesk/Announcements';
import Calendar from './pages/helpdesk/Calendar';
import OrgChart from './pages/helpdesk/OrgChart';
import EnvelopeDetail from './pages/employees/EnvelopeDetail';
import SubmitResignation from './pages/employees/SubmitResignation';
import KnowledgeBase from './pages/helpdesk/KnowledgeBase';
import AssetManagement from './pages/employees/AssetManagement';
import AssetRequests from './pages/employees/AssetRequests';
import DailyTimeReview from './pages/payroll/DailyTimeReview';
import Holidays from './pages/admin/Holidays';
import WorkforcePlanning from './pages/admin/WorkforcePlanning';
import ManpowerPlanning from './pages/payroll/ManpowerPlanning';
import COETemplates from './pages/admin/COETemplates'; // NEW
import COERequests from './pages/admin/COERequests'; // NEW

// Recruitment Pages
import Requisitions from './pages/recruitment/Requisitions';
import JobPosts from './pages/recruitment/JobPosts';
import JobPostTemplates from './pages/recruitment/JobPostTemplates';
import Applicants from './pages/recruitment/Applicants';
import Candidates from './pages/recruitment/Candidates';
import Interviews from './pages/recruitment/Interviews';
import Offers from './pages/recruitment/Offers';
import FeedbackTemplates from './pages/feedback/FeedbackTemplates';
import Apply from './pages/Apply';
import ThankYou from './pages/ThankYou';
import Departments from './pages/admin/Departments';
import ApplicationPages from './pages/recruitment/ApplicationPages';
import CareerPagePreview from './components/recruitment/CareerPagePreview';

// Analytics Pages
import RecruitmentAnalytics from './pages/analytics/RecruitmentAnalytics';
import EmployeeAnalytics from './pages/analytics/EmployeeAnalytics';
import DisciplineAnalytics from './pages/analytics/DisciplineAnalytics';

// Workflows
import { autoCelebrateBirthdays } from './services/workflows';


const ProtectedRoute: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { user, loading } = useAuth();

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

  return children;
};

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/apply" element={<Apply />} />
      <Route path="/apply/:jobPostId" element={<Apply />} />
      <Route path="/thank-you" element={<ThankYou />} />
      {/* Public Career Pages */}
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
            <Route path="wfh-requests" element={<ProtectedRoute><WFHRequests /></ProtectedRoute>} /> {/* NEW */}
            <Route path="leave" element={<ProtectedRoute><Leave /></ProtectedRoute>} />
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
             <Route path="application-pages" element={<ProtectedRoute><ApplicationPages /></ProtectedRoute>} />
             <Route path="applicants" element={<ProtectedRoute><Applicants /></ProtectedRoute>} />
             <Route path="candidates" element={<ProtectedRoute><Candidates /></ProtectedRoute>} />
             <Route path="interviews" element={<ProtectedRoute><Interviews /></ProtectedRoute>} />
             <Route path="offers" element={<ProtectedRoute><Offers /></ProtectedRoute>} />
        </Route>

      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <SettingsProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </SettingsProvider>
    </AuthProvider>
  );
};

export default App;
