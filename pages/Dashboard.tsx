import {CaseFollowups} from '../modules/caseQuestions';
import ApprovalFollowupCard from '../components/dashboard/ApprovalFollowupCard';
import AttendanceFollowups from '../components/dashboard/AttendanceFollowups';
import BodScheduleWorkflow from '../components/dashboard/BodScheduleWorkflow';
import React from 'react';
import AttendanceMission from '../components/attendance/AttendanceClock';
import { useAuth } from '../hooks/useAuth';
const HRDashboard = React.lazy(() => import('../components/dashboard/HRDashboard'));
const ManagerDashboard = React.lazy(() => import('../components/dashboard/ManagerDashboard'));
// FIX: Changed to a named import as the default export was not being resolved correctly, likely due to syntax errors in the imported file.
const EmployeeDashboard = React.lazy(() => import('../components/dashboard/EmployeeDashboard'));
import PayrollApprovalNotice from '../modules/payroll/PayrollApprovalNotice';
import { Link } from 'react-router-dom';
import AlertBanner from '../components/dashboard/AlertBanner';
import AttendancePulse from '../components/dashboard/AttendancePulse';
import QuickLinks from '../components/dashboard/QuickLinks';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const greetingName = (user?.name?.includes(',') ? user.name.split(',')[1] : user?.name)?.trim().split(/\s+/)[0];

  const renderDashboard = () => {
    switch (user?.dashboardType) {
      case 'hr':
        return <HRDashboard />;
      case 'executive':
      case 'admin':
      case 'admin_it':
      case 'manager':
        return <ManagerDashboard />;
      case 'employee':
        return <EmployeeDashboard />;
    }
    return <div>Welcome! Your authorized dashboard configuration is being prepared.</div>;
  };

  return (
    <div>
        <h1 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-white mb-3">Welcome back{greetingName ? `, ${greetingName}` : ''}!</h1>
        <AttendanceMission />
        <QuickLinks />
        <AttendancePulse />
        <BodScheduleWorkflow />
        <CaseFollowups />
        <AttendanceFollowups />
        <AlertBanner />
        <PayrollApprovalNotice />
        <ApprovalFollowupCard />
        <React.Suspense fallback={<p role="status" className="p-4">Loading your dashboard…</p>}>
          {renderDashboard()}
        </React.Suspense>
    </div>
  );
};

export default Dashboard;
