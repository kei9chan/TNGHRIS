
import React from 'react';
import Card from '../../components/ui/Card';

const Violations: React.FC = () => {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Violations / NODs</h1>
      <Card title="Disciplinary Records">
        <p className="text-gray-700 dark:text-gray-300">
          This area is for logging violations and Notices of Decision (NODs). Each record will be linked to specific entries in the company's Code of Discipline.
        </p>
        <div className="mt-4 p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-center text-gray-500 dark:text-gray-400">
          Incident recording forms and linking to the Code of Discipline will be developed here.
        </div>
      </Card>
    </div>
  );
};

export default Violations;
