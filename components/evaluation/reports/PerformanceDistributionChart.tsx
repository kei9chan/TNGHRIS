import React from 'react';
import Card from '../../ui/Card';

interface PerformanceDistributionChartProps {
    distribution: {
        'Exceeds Expectations': number;
        'Meets Expectations': number;
        'Needs Improvement': number;
    };
    total: number;
}

const PerformanceDistributionChart: React.FC<PerformanceDistributionChartProps> = ({ distribution, total }) => {
    
    const data = [
        { label: 'Exceeds Expectations', value: distribution['Exceeds Expectations'], color: 'bg-green-500' },
        { label: 'Meets Expectations', value: distribution['Meets Expectations'], color: 'bg-blue-500' },
        { label: 'Needs Improvement', value: distribution['Needs Improvement'], color: 'bg-yellow-500' },
    ];

    return (
        <Card title="Performance Distribution">
            <div className="space-y-4">
                {data.map(item => {
                    const percentage = total > 0 ? (item.value / total) * 100 : 0;
                    return (
                        <div key={item.label}>
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{item.label}</span>
                                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{item.value} Employees</span>
                            </div>
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">
                                <div 
                                    className={`${item.color} h-4 rounded-full flex items-center justify-end pr-2 text-white text-xs font-bold`} 
                                    style={{ width: `${percentage}%` }}
                                    title={`${percentage.toFixed(1)}%`}
                                >
                                    {percentage > 15 ? `${percentage.toFixed(0)}%` : ''}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
};

export default PerformanceDistributionChart;
