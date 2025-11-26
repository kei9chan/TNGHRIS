import React from 'react';
import Card from '../../ui/Card';

// Mock data for the trend chart
const trendData = [
    { name: 'Q1 2024', score: 3.8 },
    { name: 'Q2 2024', score: 4.1 },
    { name: 'Q3 2024', score: 4.0 },
    { name: 'Q4 2024', score: 4.3 },
    { name: 'Q1 2025', score: 4.2 },
];

const PerformanceTrendChart: React.FC = () => {
    return (
        <Card title="Performance Over Time">
            <div className="h-64 flex flex-col justify-end space-y-2">
                {/* Y-axis labels */}
                <div className="relative flex-grow border-l border-gray-300 dark:border-gray-600">
                    {[5, 4, 3, 2, 1].map(label => (
                        <div key={label} className="absolute text-xs text-gray-400" style={{ bottom: `calc(${(label-1)/4 * 100}% - 6px)`, left: '-2em' }}>{label.toFixed(1)}</div>
                    ))}
                    
                    {/* Data points and lines (simplified SVG) */}
                    <svg className="w-full h-full" preserveAspectRatio="none">
                        <path 
                            d={trendData.map((d, i) => 
                                `${i === 0 ? 'M' : 'L'} ${i / (trendData.length - 1) * 100}% ${100 - ((d.score - 1) / 4) * 100}%`
                            ).join(' ')}
                            fill="none"
                            stroke="#4f46e5"
                            strokeWidth="2"
                            vectorEffect="non-scaling-stroke"
                        />
                         {trendData.map((d, i) => (
                            <circle
                                key={i}
                                cx={`${i / (trendData.length - 1) * 100}%`}
                                cy={`${100 - ((d.score - 1) / 4) * 100}%`}
                                r="4"
                                fill="#4f46e5"
                                className="cursor-pointer"
                            >
                                <title>{`${d.name}: ${d.score.toFixed(2)}`}</title>
                            </circle>
                         ))}
                    </svg>
                </div>
                {/* X-axis labels */}
                <div className="flex justify-between border-t border-gray-300 dark:border-gray-600 pt-2">
                    {trendData.map(d => (
                        <span key={d.name} className="text-xs text-gray-500 dark:text-gray-400">{d.name}</span>
                    ))}
                </div>
            </div>
        </Card>
    );
};

export default PerformanceTrendChart;
