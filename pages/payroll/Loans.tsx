import React from 'react';
import Card from '../../components/ui/Card';

const Loans: React.FC = () => {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Loan Application System</h1>
      <Card>
        <div className="text-center py-24 text-gray-500 dark:text-gray-400">
          <p className="text-2xl font-semibold">Coming Soon!</p>
          <p className="mt-2 text-lg">This feature is currently under development.</p>
          <p className="mt-1">The Loan Application System will be available here in a future update.</p>
        </div>
      </Card>
    </div>
  );
};

export default Loans;
