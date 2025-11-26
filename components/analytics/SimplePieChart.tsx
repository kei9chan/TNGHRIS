import React from 'react';

interface PieChartData {
    label: string;
    value: number;
    color: string;
}

interface SimplePieChartProps {
    data: PieChartData[];
}

const SimplePieChart: React.FC<SimplePieChartProps> = ({ data }) => {
    const total = data.reduce((sum, item) => sum + item.value, 0);
    if (total === 0) {
        return <div className="text-center text-gray-500">No data available.</div>;
    }

    let cumulative = 0;
    const chartData = data.map(item => {
        const percentage = (item.value / total) * 100;
        const startAngle = (cumulative / 100) * 360;
        cumulative += percentage;
        const endAngle = (cumulative / 100) * 360;
        return { ...item, percentage, startAngle, endAngle };
    });

    const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
        const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
        return {
            x: centerX + (radius * Math.cos(angleInRadians)),
            y: centerY + (radius * Math.sin(angleInRadians))
        };
    };
    
    const getArcPath = (startAngle: number, endAngle: number) => {
        const start = polarToCartesian(50, 50, 40, endAngle);
        const end = polarToCartesian(50, 50, 40, startAngle);
        const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
        return [
            "M", start.x, start.y, 
            "A", 40, 40, 0, largeArcFlag, 0, end.x, end.y,
            "L 50 50 Z"
        ].join(" ");
    };
    
    return (
        <div className="flex flex-col md:flex-row items-center justify-center gap-6">
            <div className="relative w-48 h-48 flex-shrink-0">
                <svg viewBox="0 0 100 100" className="transform -rotate-90">
                    {chartData.map(item => (
                        <path
                            key={item.label}
                            d={getArcPath(item.startAngle, item.endAngle)}
                            className={item.color}
                            stroke="white"
                            strokeWidth="2"
                        />
                    ))}
                     <circle cx="50" cy="50" r="20" fill="white" className="dark:fill-slate-800" />
                </svg>
                 <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-bold text-gray-800 dark:text-gray-200">{total}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">Total</span>
                </div>
            </div>
            <div className="w-full space-y-2">
                {chartData.map(item => (
                    <div key={item.label} className="flex items-center justify-between gap-4">
                        <div className="flex items-center min-w-0">
                            <div className={`w-3 h-3 rounded-sm mr-2 flex-shrink-0 ${item.color}`}></div>
                            <span className="text-sm text-gray-700 dark:text-gray-300 truncate" title={item.label}>
                                {item.label}
                            </span>
                        </div>
                        <span className="flex-shrink-0 text-sm font-semibold text-gray-800 dark:text-gray-200">
                            {item.value} ({item.percentage.toFixed(0)}%)
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default SimplePieChart;