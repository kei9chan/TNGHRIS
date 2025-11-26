
import React from 'react';
import { SurveySection } from '../../types';

interface HeatmapData {
    department: string;
    sectionScores: Record<string, number>; // sectionId -> average score
}

interface PulseHeatmapProps {
    sections: SurveySection[];
    data: HeatmapData[];
}

const getScoreColor = (score: number) => {
    if (score >= 4.5) return 'bg-green-500 text-white';
    if (score >= 4.0) return 'bg-green-400 text-white';
    if (score >= 3.5) return 'bg-lime-400 text-gray-800';
    if (score >= 3.0) return 'bg-yellow-400 text-gray-800';
    if (score >= 2.5) return 'bg-orange-400 text-white';
    return 'bg-red-500 text-white';
};

const PulseHeatmap: React.FC<PulseHeatmapProps> = ({ sections, data }) => {
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider border-r dark:border-gray-700 sticky left-0 bg-gray-50 dark:bg-gray-800 z-10 min-w-[150px]">
                            Department
                        </th>
                        {sections.map(section => (
                            <th key={section.id} className="px-2 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider min-w-[100px] border-r dark:border-gray-700">
                                {section.title}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                    {data.map(row => (
                        <tr key={row.department}>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white border-r dark:border-gray-700 sticky left-0 bg-white dark:bg-gray-900 z-10">
                                {row.department}
                            </td>
                            {sections.map(section => {
                                const score = row.sectionScores[section.id] || 0;
                                const displayScore = score > 0 ? score.toFixed(1) : '-';
                                const colorClass = score > 0 ? getScoreColor(score) : 'bg-gray-100 dark:bg-gray-800 text-gray-400';
                                
                                return (
                                    <td key={`${row.department}-${section.id}`} className="p-1 border-r dark:border-gray-700 last:border-r-0">
                                        <div 
                                            className={`w-full h-10 flex items-center justify-center rounded font-bold text-sm ${colorClass}`}
                                            title={`${section.title}: ${displayScore}`}
                                        >
                                            {displayScore}
                                        </div>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                    {data.length === 0 && (
                        <tr>
                            <td colSpan={sections.length + 1} className="text-center py-10 text-gray-500 dark:text-gray-400">
                                No data available to generate heatmap.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default PulseHeatmap;
