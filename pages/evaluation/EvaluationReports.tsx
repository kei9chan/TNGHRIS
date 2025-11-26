import React, { useState, useMemo, useEffect } from 'react';
import Card from '../../components/ui/Card';
import { mockEvaluations, mockEvaluationSubmissions, mockUsers, mockEvaluationTimelines, mockBusinessUnits, mockDepartments } from '../../services/mockData';
import { Evaluation, EvaluationSubmission, User } from '../../types';
import EvaluationKPIs from '../../components/evaluation/reports/EvaluationKPIs';
import PerformanceDistributionChart from '../../components/evaluation/reports/PerformanceDistributionChart';
import DepartmentPerformanceTable from '../../components/evaluation/reports/DepartmentPerformanceTable';
import PerformanceTrendChart from '../../components/evaluation/reports/PerformanceTrendChart';

// Define performance thresholds
const RATING_THRESHOLDS = {
    NEEDS_IMPROVEMENT: 2.5,
    MEETS_EXPECTATIONS: 4.0,
};

const EvaluationReports: React.FC = () => {
    const availableYears = useMemo(() => {
        const years = new Set(mockEvaluationTimelines.map(t => new Date(t.rolloutDate).getFullYear().toString()));
        return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
    }, []);

    const [selectedYear, setSelectedYear] = useState<string>(availableYears[0] || new Date().getFullYear().toString());
    const [selectedBuId, setSelectedBuId] = useState<string>('');

    const timelinesForYear = useMemo(() => {
        return mockEvaluationTimelines.filter(t => new Date(t.rolloutDate).getFullYear().toString() === selectedYear);
    }, [selectedYear]);

    const [selectedTimelineId, setSelectedTimelineId] = useState<string>('');
    
    useEffect(() => {
        if (timelinesForYear.length > 0) {
            setSelectedTimelineId(timelinesForYear[0].id);
        } else {
            setSelectedTimelineId('');
        }
    }, [timelinesForYear]);


    const evaluationData = useMemo(() => {
        if (!selectedTimelineId) {
            return {
                submissions: [],
                evaluations: [],
                targetUsers: [],
            };
        }

        const evaluationsInTimeline = mockEvaluations.filter(e => e.timelineId === selectedTimelineId);
        const evaluationIds = new Set(evaluationsInTimeline.map(e => e.id));
        const submissionsInTimeline = mockEvaluationSubmissions.filter(s => evaluationIds.has(s.evaluationId));
        
        const targetUserIds = new Set(evaluationsInTimeline.flatMap(e => e.targetEmployeeIds));
        let targetUsers = mockUsers.filter(u => targetUserIds.has(u.id));

        if (selectedBuId) {
            const buName = mockBusinessUnits.find(bu => bu.id === selectedBuId)?.name;
            targetUsers = targetUsers.filter(u => u.businessUnit === buName);
        }

        return {
            submissions: submissionsInTimeline,
            evaluations: evaluationsInTimeline,
            targetUsers: targetUsers,
        };
    }, [selectedTimelineId, selectedBuId]);

    const processedResults = useMemo(() => {
        const employeeScores: { user: User; score: number }[] = evaluationData.targetUsers.map(user => {
            const submissionsForUser = evaluationData.submissions.filter(s => s.subjectEmployeeId === user.id);
            if (submissionsForUser.length === 0) {
                return { user, score: 0 };
            }
            const totalScore = submissionsForUser.reduce((sum, s) => {
                const subAvg = s.scores.reduce((avgSum, score) => avgSum + score.score, 0) / (s.scores.length || 1);
                return sum + subAvg;
            }, 0);
            return { user, score: totalScore / submissionsForUser.length };
        }).filter(item => item.score > 0);

        const overallAverage = employeeScores.reduce((sum, es) => sum + es.score, 0) / (employeeScores.length || 1);

        const distribution = {
            'Exceeds Expectations': employeeScores.filter(es => es.score > RATING_THRESHOLDS.MEETS_EXPECTATIONS).length,
            'Meets Expectations': employeeScores.filter(es => es.score > RATING_THRESHOLDS.NEEDS_IMPROVEMENT && es.score <= RATING_THRESHOLDS.MEETS_EXPECTATIONS).length,
            'Needs Improvement': employeeScores.filter(es => es.score <= RATING_THRESHOLDS.NEEDS_IMPROVEMENT).length,
        };

        const departmentScores: Record<string, { totalScore: number; count: number }> = {};
        employeeScores.forEach(({ user, score }) => {
            const dept = user.department || 'Unassigned';
            if (!departmentScores[dept]) {
                departmentScores[dept] = { totalScore: 0, count: 0 };
            }
            departmentScores[dept].totalScore += score;
            departmentScores[dept].count++;
        });

        const departmentAverages = Object.entries(departmentScores).map(([name, data]) => ({
            name,
            averageScore: data.totalScore / data.count,
            employeeCount: data.count
        }));

        return { employeeScores, overallAverage, distribution, departmentAverages };
    }, [evaluationData]);
    
    const kpiData = {
        overallScore: processedResults.overallAverage,
        completionRate: (evaluationData.submissions.length / (evaluationData.targetUsers.length * (evaluationData.evaluations[0]?.evaluators.length || 1))) * 100,
        participants: evaluationData.targetUsers.length,
        topDepartment: processedResults.departmentAverages.sort((a,b) => b.averageScore - a.averageScore)[0]?.name || 'N/A'
    };

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Evaluation Reports</h1>
            <p className="text-gray-600 dark:text-gray-400 -mt-4">View summary insights from evaluations — monitor completion rates, average scores, and performance trends per department.</p>
            
            <Card>
                <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label htmlFor="year-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Year</label>
                        <select id="year-filter" value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                            {availableYears.map(year => <option key={year} value={year}>{year}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="timeline-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Timeline</label>
                        <select id="timeline-filter" value={selectedTimelineId} onChange={e => setSelectedTimelineId(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                            {timelinesForYear.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    </div>
                     <div>
                        <label htmlFor="bu-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Unit</label>
                        <select id="bu-filter" value={selectedBuId} onChange={e => setSelectedBuId(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                             <option value="">All Business Units</option>
                            {mockBusinessUnits.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                        </select>
                    </div>
                </div>
            </Card>

            <EvaluationKPIs data={kpiData} />
            
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-2">
                    <PerformanceDistributionChart distribution={processedResults.distribution} total={processedResults.employeeScores.length} />
                </div>
                <div className="lg:col-span-3">
                     <PerformanceTrendChart />
                </div>
            </div>

            <DepartmentPerformanceTable departments={processedResults.departmentAverages} />
        </div>
    );
};

export default EvaluationReports;
