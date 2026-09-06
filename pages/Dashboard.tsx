import React from 'react';
import AttendanceMission from '../components/attendance/AttendanceClock';
import { useAuth } from '../hooks/useAuth';
import HRDashboard from '../components/dashboard/HRDashboard';
import ManagerDashboard from '../components/dashboard/ManagerDashboard';
// FIX: Changed to a named import as the default export was not being resolved correctly, likely due to syntax errors in the imported file.
import EmployeeDashboard from '../components/dashboard/EmployeeDashboard';
import PayrollApprovalNotice from '../modules/payroll/PayrollApprovalNotice';
import { Link } from 'react-router-dom';
import AlertBanner from '../components/dashboard/AlertBanner';

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
        <h1 className="text-lg sm:text-xl font-semibold text-white mb-3">Welcome back{greetingName ? `, ${greetingName}` : ''}!</h1>
        <AttendanceMission />
        <AlertBanner />
        <PayrollApprovalNotice />
        {renderDashboard()}
    </div>
  );
};

export default Dashboard;
