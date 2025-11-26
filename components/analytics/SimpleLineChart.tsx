import React from 'react';
import Card from '../ui/Card';

interface LineChartData {
    label: string;
    value: number;
}

interface SimpleLineChartProps {
    data: LineChartData[];
}

const SimpleLineChart: React.FC<SimpleLineChartProps> = ({ data }) => {
    if (data.length === 0) {
        return <div className="text-center text-gray-500">No data available.</div>;
    }

    const maxValue = Math.max(...data.map(d => d.value));
    const normalizedData = data.map(d => ({ ...d, y: 100 - (d.value / maxValue) * 100 }));

    const pathData = normalizedData.map((d, i) => {
        const x = (i / (data.length - 1)) * 100;
        return `${i === 0 ? 'M' : 'L'} ${x},${d.y}`;
    }).join(' ');

    return (
        <div className="h-64 flex flex-col justify-end space-y-2">
            <div className="relative flex-grow border-l border-b border-gray-300 dark:border-gray-600">
                {/* Y-axis labels */}
                {[0, 0.25, 0.5, 0.75, 1].map(tick => (
                    <div key={tick} className="absolute w-full flex items-center" style={{ bottom: `${tick * 100}%` }}>
                        <span className="text-xs text-gray-400 -ml-8">{Math.round(tick * maxValue)}</span>
                        <div className="flex-grow border-b border-dashed border-gray-200 dark:border-gray-700"></div>
                    </div>
                ))}
                
                {/* SVG Chart */}
                <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                    <path 
                        d={pathData}
                        fill="none"
                        stroke="#4f46e5"
                        strokeWidth="2"
                        vectorEffect="non-scaling-stroke"
                    />
                    {normalizedData.map((d, i) => (
                        <circle
                            key={i}
                            cx={`${(i / (data.length - 1)) * 100}`}
                            cy={`${d.y}`}
                            r="2"
                            fill="#4f46e5"
                            className="cursor-pointer"
                        >
                            <title>{`${d.label}: ${d.value}`}</title>
                        </circle>
                    ))}
                </svg>
            </div>
            {/* X-axis labels */}
            <div className="flex justify-between -mx-2">
                {data.map(d => (
                    <span key={d.label} className="text-xs text-gray-500 dark:text-gray-400 px-1 text-center">{d.label}</span>
                ))}
            </div>
        </div>
    );
};

export default SimpleLineChart;
