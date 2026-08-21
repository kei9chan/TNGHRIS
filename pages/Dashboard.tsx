import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import HRDashboard from '../components/dashboard/HRDashboard';
import ManagerDashboard from '../components/dashboard/ManagerDashboard';
// FIX: Changed to a named import as the default export was not being resolved correctly, likely due to syntax errors in the imported file.
import EmployeeDashboard from '../components/dashboard/EmployeeDashboard';
import AlertBanner from '../components/dashboard/AlertBanner';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { dashboardType, loading } = usePermissions();

  const renderDashboard = () => {
    if (loading) {
      return <div className="py-12 text-center text-slate-500">Resolving dashboard access...</div>;
    }
    switch (dashboardType) {
      case 'hr':
        return <HRDashboard />;
      case 'manager':
      case 'executive':
        return <ManagerDashboard />;
      case 'employee':
        return <EmployeeDashboard />;
      default:
        return <div>Your role does not have a valid dashboard configuration.</div>;
    }
  };

  return (
    <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Welcome back, {user?.name}!</h1>
        <AlertBanner />
        {renderDashboard()}
    </div>
  );
};

export default Dashboard;
