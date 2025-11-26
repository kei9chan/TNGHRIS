import React from 'react';

interface CoachingImpactChartProps {
    coachingCounts: Record<string, number>;
    incidentCounts: Record<string, number>;
}

const CoachingImpactChart: React.FC<CoachingImpactChartProps> = ({ coachingCounts, incidentCounts }) => {
    // Get all unique categories
    const categories = Array.from(new Set([...Object.keys(coachingCounts), ...Object.keys(incidentCounts)]));
    
    if (categories.length === 0) {
        return <div className="text-center text-gray-500 py-10">No data available.</div>;
    }

    const maxValue = Math.max(
        ...categories.map(c => (coachingCounts[c] || 0) + (incidentCounts[c] || 0))
    );

    return (
        <div className="space-y-4">
            {categories.map(category => {
                const coaching = coachingCounts[category] || 0;
                const incidents = incidentCounts[category] || 0;
                const total = coaching + incidents;
                
                // Calculate percentages relative to the max value for bar width
                const coachingWidth = maxValue > 0 ? (coaching / maxValue) * 100 : 0;
                const incidentWidth = maxValue > 0 ? (incidents / maxValue) * 100 : 0;

                return (
                    <div key={category}>
                        <div className="flex justify-between text-xs mb-1">
                            <span className="font-semibold text-gray-700 dark:text-gray-300">{category}</span>
                            <span className="text-gray-500 dark:text-gray-400">
                                {coaching} Coaching / {incidents} Incidents
                            </span>
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-4 flex overflow-hidden">
                             {/* Coaching Bar */}
                            <div 
                                className="bg-green-500 h-full transition-all duration-500 relative group" 
                                style={{ width: `${coachingWidth}%` }}
                                title={`${coaching} Coaching Sessions`}
                            >
                                {coachingWidth > 10 && <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white font-bold">{coaching}</span>}
                            </div>
                             {/* Incident Bar */}
                             <div 
                                className="bg-red-500 h-full transition-all duration-500 relative group" 
                                style={{ width: `${incidentWidth}%` }}
                                title={`${incidents} Incident Reports`}
                            >
                                {incidentWidth > 10 && <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white font-bold">{incidents}</span>}
                            </div>
                        </div>
                    </div>
                );
            })}
             <div className="flex gap-4 justify-center mt-4 text-xs text-gray-600 dark:text-gray-400">
                <div className="flex items-center"><span className="w-3 h-3 bg-green-500 rounded-sm mr-1"></span> Coaching (Prevention)</div>
                <div className="flex items-center"><span className="w-3 h-3 bg-red-500 rounded-sm mr-1"></span> Incidents (Violations)</div>
            </div>
        </div>
    );
};

export default CoachingImpactChart;