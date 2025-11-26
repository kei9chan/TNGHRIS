import React from 'react';
import Card from '../../components/ui/Card';

const Offboarding: React.FC = () => {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Offboarding Management</h1>
      <p className="text-gray-600 dark:text-gray-400">
        Manage and track the offboarding process for resigning employees. This module will automatically trigger when an employee submits a resignation or is tagged as "Resigned."
      </p>
      <Card>
        <div className="text-center py-24 text-gray-500 dark:text-gray-400">
          <p className="text-2xl font-semibold">Offboarding Module - Coming Soon!</p>
          <p className="mt-2 text-lg">The offboarding checklist and clearance workflow will be built here.</p>
        </div>
      </Card>
    </div>
  );
};

export default Offboarding;