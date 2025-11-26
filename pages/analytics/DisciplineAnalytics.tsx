import React, { useMemo } from 'react';
import AnalyticsCard from '../../components/analytics/AnalyticsCard';
import SimpleBarChart from '../../components/analytics/SimpleBarChart';
import SimplePieChart from '../../components/analytics/SimplePieChart';
import SimpleLineChart from '../../components/analytics/SimpleLineChart';
import CoachingImpactChart from '../../components/analytics/CoachingImpactChart';
import { mockIncidentReports, mockResolutions, mockCoachingSessions } from '../../services/mockData';
import { ResolutionType, CoachingTrigger } from '../../types';
import EditableDescription from '../../components/ui/EditableDescription';
import Card from '../../components/ui/Card';

const DisciplineAnalytics: React.FC = () => {

    const commonViolations = useMemo(() => {
        const counts: Record<string, number> = {};
        mockIncidentReports.forEach(report => {
            counts[report.category] = (counts[report.category] || 0) + 1;
        });
        return Object.entries(counts)
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value);
    }, []);

    const casesPerMonth = useMemo(() => {
        const counts: Record<string, number> = {};
        // Initialize the last 12 months to ensure continuity
        for (let i = 11; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const monthKey = d.toLocaleString('default', { month: 'short', year: '2-digit' });
            counts[monthKey] = 0;
        }

        mockIncidentReports.forEach(report => {
            const monthKey = new Date(report.dateTime).toLocaleString('default', { month: 'short', year: '2-digit' });
            if (counts.hasOwnProperty(monthKey)) {
                counts[monthKey]++;
            }
        });

        return Object.entries(counts).map(([label, value]) => ({ label, value }));
    }, []);

    const resolutionOutcomes = useMemo(() => {
        const counts: Record<string, number> = {};
        mockResolutions.forEach(res => {
            counts[res.resolutionType] = (counts[res.resolutionType] || 0) + 1;
        });
        const colors: Record<ResolutionType, string> = {
            [ResolutionType.CaseDismissed]: 'bg-gray-400',
            [ResolutionType.VerbalWarning]: 'bg-yellow-400',
            [ResolutionType.WrittenWarning]: 'bg-orange-500',
            [ResolutionType.Suspension]: 'bg-red-500',
            [ResolutionType.Termination]: 'bg-red-700',
        };
        return Object.entries(counts).map(([label, value]) => ({ label, value, color: colors[label as ResolutionType] || 'bg-blue-500' }));
    }, []);

    // --- Coaching Impact Analysis ---
    const coachingStats = useMemo(() => {
        const coachingCounts: Record<string, number> = {};
        mockCoachingSessions.forEach(session => {
            const category = session.trigger; // Assuming Trigger roughly maps to Category
            coachingCounts[category] = (coachingCounts[category] || 0) + 1;
        });

        const incidentCounts: Record<string, number> = {};
        mockIncidentReports.forEach(report => {
            // Normalize category names if needed, for now assume direct match or close enough
            incidentCounts[report.category] = (incidentCounts[report.category] || 0) + 1;
        });
        
        return { coachingCounts, incidentCounts };
    }, []);
    
    const paperTrailCandidates = useMemo(() => {
        const employeeHistory: Record<string, { name: string, coaching: Record<string, number>, incidents: Record<string, number> }> = {};

        mockCoachingSessions.forEach(s => {
            if (!employeeHistory[s.employeeId]) employeeHistory[s.employeeId] = { name: s.employeeName, coaching: {}, incidents: {} };
            employeeHistory[s.employeeId].coaching[s.trigger] = (employeeHistory[s.employeeId].coaching[s.trigger] || 0) + 1;
        });

        mockIncidentReports.forEach(ir => {
            ir.involvedEmployeeIds.forEach(empId => {
                if (!employeeHistory[empId]) {
                    // Find name from somewhere if not in coaching, or use placeholder
                    employeeHistory[empId] = { name: ir.involvedEmployeeNames[ir.involvedEmployeeIds.indexOf(empId)], coaching: {}, incidents: {} };
                }
                employeeHistory[empId].incidents[ir.category] = (employeeHistory[empId].incidents[ir.category] || 0) + 1;
            });
        });

        const candidates: { name: string, category: string, coachingCount: number, incidentCount: number }[] = [];

        Object.values(employeeHistory).forEach(emp => {
            Object.keys(emp.coaching).forEach(category => {
                if (emp.incidents[category] > 0) {
                    candidates.push({
                        name: emp.name,
                        category,
                        coachingCount: emp.coaching[category],
                        incidentCount: emp.incidents[category]
                    });
                }
            });
        });

        return candidates;
    }, []);

    const coachingSuccessRate = useMemo(() => {
         // Simplistic metric: Total Coaching Sessions that did NOT have a subsequent IR in same category for same user within 30 days.
         // For this MVP visualization, let's just use (Total Coaching) / (Total Coaching + Total IRs) as "Intervention Ratio"
         const totalCoaching = mockCoachingSessions.length;
         const totalIRs = mockIncidentReports.length;
         const ratio = totalCoaching > 0 ? (totalCoaching / (totalCoaching + totalIRs)) * 100 : 0;
         return ratio.toFixed(0);
    }, []);


    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Discipline & Coaching Analytics</h1>
            <EditableDescription descriptionKey="analyticsDisciplineDesc" />
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <AnalyticsCard title="Intervention vs. Violation (Impact)">
                    <div className="flex flex-col h-full">
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                            Comparing proactive coaching sessions against actual incident reports by category. 
                            High coaching with low incidents indicates effective prevention.
                        </p>
                        <CoachingImpactChart 
                            coachingCounts={coachingStats.coachingCounts} 
                            incidentCounts={coachingStats.incidentCounts} 
                        />
                    </div>
                </AnalyticsCard>

                 <Card title="Due Process Paper Trail">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                        Employees with documented coaching sessions prior to or alongside disciplinary cases. This data supports "Just Cause" in termination proceedings.
                    </p>
                    {paperTrailCandidates.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-gray-50 dark:bg-gray-700">
                                    <tr>
                                        <th className="px-4 py-2 text-left">Employee</th>
                                        <th className="px-4 py-2 text-left">Category</th>
                                        <th className="px-4 py-2 text-center">Coaching</th>
                                        <th className="px-4 py-2 text-center">Incidents</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {paperTrailCandidates.map((c, idx) => (
                                        <tr key={idx}>
                                            <td className="px-4 py-2 font-medium">{c.name}</td>
                                            <td className="px-4 py-2">{c.category}</td>
                                            <td className="px-4 py-2 text-center text-green-600 font-bold">{c.coachingCount}</td>
                                            <td className="px-4 py-2 text-center text-red-600 font-bold">{c.incidentCount}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="text-center py-8 text-gray-500">No correlation data found yet.</p>
                    )}
                </Card>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <AnalyticsCard title="Most Common Violations">
                    <SimpleBarChart data={commonViolations} />
                </AnalyticsCard>
                <AnalyticsCard title="Resolution Outcomes">
                    <SimplePieChart data={resolutionOutcomes} />
                </AnalyticsCard>
            </div>

            <AnalyticsCard title="Cases Per Month">
                <SimpleLineChart data={casesPerMonth} />
            </AnalyticsCard>
        </div>
    );
};

export default DisciplineAnalytics;