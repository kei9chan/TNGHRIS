import React from 'react';
import { useAuth } from '../hooks/useAuth';
import HRDashboard from '../components/dashboard/HRDashboard';
import ManagerDashboard from '../components/dashboard/ManagerDashboard';
// FIX: Changed to a named import as the default export was not being resolved correctly, likely due to syntax errors in the imported file.
import EmployeeDashboard from '../components/dashboard/EmployeeDashboard';
import AlertBanner from '../components/dashboard/AlertBanner';

const Dashboard: React.FC = () => {
  const { user } = useAuth();

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
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Welcome back, {user?.name}!</h1>
        <AlertBanner />
        {renderDashboard()}
    </div>
  );
};

export default Dashboard;
