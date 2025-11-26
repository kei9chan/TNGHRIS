
import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import EmployeeSubNav from './EmployeeSubNav';
import FeedbackSubNav from './FeedbackSubNav';
import PayrollSubNav from './PayrollSubNav';
import EvaluationSubNav from './EvaluationSubNav';
import AdminSubNav from './AdminSubNav';
import HelpdeskSubNav from './HelpdeskSubNav';
import RecruitmentSubNav from './RecruitmentSubNav';
import AnalyticsSubNav from './AnalyticsSubNav';
import FaqBot from '../helpdesk/FaqBot';
import AssetManagementSubNav from './AssetManagementSubNav';
import COESubNav from './COESubNav';

const Layout: React.FC = () => {
  const location = useLocation();
  const isEmployeeSection = location.pathname.startsWith('/employees');
  const isAssetManagementSection = location.pathname.startsWith('/employees/asset-management');
  const isCOESection = location.pathname.startsWith('/employees/coe');
  const isFeedbackSection = location.pathname.startsWith('/feedback');
  const isPayrollSection = location.pathname.startsWith('/payroll');
  const isEvaluationSection = location.pathname.startsWith('/evaluation');
  const isRecruitmentSection = location.pathname.startsWith('/recruitment');
  const isAnalyticsSection = location.pathname.startsWith('/employees/analytics');
  const isHelpdeskSection = location.pathname.startsWith('/helpdesk');
  const isAdminSection = location.pathname.startsWith('/admin');

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-slate-900">
      {/* Main Header - z-40 to stay above everything */}
      <div className="sticky top-0 z-40">
        <Header />
      </div>

      {/* Sub Navigation - z-30 to stay above page content but below header */}
      <div className="sticky top-16 z-30 bg-gray-100 dark:bg-slate-900 shadow-sm">
        {isEmployeeSection && <EmployeeSubNav />}
        {isAssetManagementSection && <AssetManagementSubNav />}
        {isCOESection && <COESubNav />}
        {isFeedbackSection && <FeedbackSubNav />}
        {isPayrollSection && <PayrollSubNav />}
        {isEvaluationSection && <EvaluationSubNav />}
        {isRecruitmentSection && <RecruitmentSubNav />}
        {isAnalyticsSection && <AnalyticsSubNav />}
        {isHelpdeskSection && <HelpdeskSubNav />}
        {isAdminSection && <AdminSubNav />}
      </div>

      <main className="relative z-0">
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>
      <FaqBot />
    </div>
  );
};

export default Layout;
