import React from 'react';

interface BarChartData {
    label: string;
    value: number;
}

interface SimpleBarChartProps {
    data: BarChartData[];
}

const SimpleBarChart: React.FC<SimpleBarChartProps> = ({ data }) => {
    if (!data || data.length === 0) {
        return <div className="text-center text-gray-500">No data available.</div>;
    }
    const maxValue = Math.max(...data.map(d => d.value), 0);

    return (
        <div className="space-y-4">
            {data.map(item => {
                const percentage = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
                return (
                    <div key={item.label} className="grid grid-cols-12 gap-2 items-center text-sm">
                        <div className="col-span-5 truncate font-medium text-gray-700 dark:text-gray-300" title={item.label}>
                            {item.label}
                        </div>
                        <div className="col-span-6">
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                                <div
                                    className="bg-indigo-600 h-3 rounded-full transition-all duration-300"
                                    style={{ width: `${percentage}%` }}
                                ></div>
                            </div>
                        </div>
                        <div className="col-span-1 text-right font-bold text-gray-800 dark:text-gray-200">
                            {item.value}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default SimpleBarChart;