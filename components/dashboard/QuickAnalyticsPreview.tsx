import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../ui/Card';
import SimpleBarChart from '../analytics/SimpleBarChart';
import { mockUsers, mockIncidentReports, mockResolutions, mockApplications, mockJobRequisitions, mockOffers, mockResignations } from '../../services/mockData';
import { ApplicationStage, OfferStatus, IRStatus, ResignationStatus } from '../../types';

const ArrowRightIcon: React.FC = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>;

const getQuarterDateRange = (year: number, quarter: number) => {
    if (quarter === 0) { // Yearly summary
        const start = new Date(year, 0, 1);
        const end = new Date(year, 11, 31);
        end.setHours(23, 59, 59, 999);
        return { start, end };
    }
    
    let startMonth, endMonth;
    switch (quarter) {
        case 1: startMonth = 0; endMonth = 2; break; // Jan-Mar
        case 2: startMonth = 3; endMonth = 5; break; // Apr-Jun
        case 3: startMonth = 6; endMonth = 8; break; // Jul-Sep
        case 4: startMonth = 9; endMonth = 11; break; // Oct-Dec
        default: return { start: new Date(), end: new Date() };
    }
    const start = new Date(year, startMonth, 1);
    const end = new Date(year, endMonth + 1, 0);
    end.setHours(23, 59, 59, 999); // Include the whole end day
    return { start, end };
};


const QuickAnalyticsPreview: React.FC = () => {
    const availableYears = useMemo(() => 
        [...new Set(mockJobRequisitions.map(r => new Date(r.createdAt).getFullYear()))]
        .sort((a,b) => b-a)
    , []);

    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedQuarter, setSelectedQuarter] = useState(Math.floor(new Date().getMonth() / 3) + 1);
    const [activeTab, setActiveTab] = useState<'employees' | 'recruitment' | 'discipline'>('employees');


    const dateRange = useMemo(() => getQuarterDateRange(selectedYear, selectedQuarter), [selectedYear, selectedQuarter]);

    // Employee Analytics
    const employeeData = useMemo(() => {
        const activeUsers = mockUsers.filter(u => u.status === 'Active');
        
        const resignationsInPeriod = mockResignations.filter(res => {
            const lastDay = new Date(res.lastWorkingDay);
            return lastDay >= dateRange.start && lastDay <= dateRange.end;
        }).length;
        
        const turnoverRate = activeUsers.length > 0 ? (resignationsInPeriod / activeUsers.length) * 100 : 0;
        
        const headcountByDept: Record<string, number> = {};
        activeUsers.forEach(user => {
            headcountByDept[user.department] = (headcountByDept[user.department] || 0) + 1;
        });
        const deptData = Object.entries(headcountByDept)
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 3);

        return {
            headcount: activeUsers.length,
            turnover: turnoverRate.toFixed(1) + '%',
            deptData,
        };
    }, [dateRange]);

    // Recruitment Analytics
    const recruitmentData = useMemo(() => {
        const hiredApps = mockApplications.filter(app => 
            app.stage === ApplicationStage.Hired &&
            new Date(app.updatedAt) >= dateRange.start &&
            new Date(app.updatedAt) <= dateRange.end
        );

        let timeToFill = 0;
        if (hiredApps.length > 0) {
            const totalDays = hiredApps.reduce((sum, app) => {
                const requisition = mockJobRequisitions.find(r => r.id === app.requisitionId);
                if (!requisition) return sum;
                const diffTime = Math.abs(new Date(app.updatedAt).getTime() - new Date(requisition.createdAt).getTime());
                return sum + Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            }, 0);
            timeToFill = Math.round(totalDays / hiredApps.length);
        }

        const offersInPeriod = mockOffers.filter(offer => {
            const app = mockApplications.find(a => a.id === offer.applicationId);
            return app && new Date(app.updatedAt) >= dateRange.start && new Date(app.updatedAt) <= dateRange.end;
        });

        const sentOffers = offersInPeriod.filter(o => o.status !== OfferStatus.Draft);
        const acceptedCount = sentOffers.filter(o => [OfferStatus.Signed, OfferStatus.Converted].includes(o.status)).length;
        const acceptanceRate = sentOffers.length > 0 ? (acceptedCount / sentOffers.length) * 100 : 0;

        return {
            timeToFill: `${timeToFill} days`,
            acceptanceRate: acceptanceRate.toFixed(1) + '%',
        };
    }, [dateRange]);
    
    // Discipline Analytics
    const disciplineData = useMemo(() => {
        const reportsInPeriod = mockIncidentReports.filter(report => {
            const reportDate = new Date(report.dateTime);
            return reportDate >= dateRange.start && reportDate <= dateRange.end;
        });

        const openCases = reportsInPeriod.filter(r => r.status !== IRStatus.Closed && r.status !== IRStatus.NoAction).length;

        const violationCounts: Record<string, number> = {};
        reportsInPeriod.forEach(report => {
            violationCounts[report.category] = (violationCounts[report.category] || 0) + 1;
        });
        const commonViolations = Object.entries(violationCounts)
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 3);
            
        return {
            openCases,
            commonViolations
        }
    }, [dateRange]);

    const tabClass = (tabName: typeof activeTab) =>
        `py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
        activeTab === tabName
            ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
        }`;

    const renderTabContent = () => {
        switch (activeTab) {
            case 'employees':
                return (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="p-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg text-center">
                                <p className="text-sm text-gray-500 dark:text-gray-400">Active Headcount</p>
                                <p className="text-4xl font-bold text-gray-900 dark:text-white">{employeeData.headcount}</p>
                            </div>
                            <div className="p-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg text-center">
                                <p className="text-sm text-gray-500 dark:text-gray-400">{selectedQuarter === 0 ? 'Annual Turnover' : 'Quarterly Turnover'}</p>
                                <p className="text-4xl font-bold text-gray-900 dark:text-white">{employeeData.turnover}</p>
                            </div>
                        </div>
                        <div>
                            <h4 className="font-semibold text-center text-sm mb-4">Top Departments by Headcount</h4>
                            <SimpleBarChart data={employeeData.deptData} />
                        </div>
                        <div className="text-right">
                            <Link to="/employees/analytics/employee" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline flex items-center justify-end">
                                Full Report <ArrowRightIcon />
                            </Link>
                        </div>
                    </div>
                );
            case 'recruitment':
                 return (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="p-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg text-center">
                                <p className="text-sm text-gray-500 dark:text-gray-400">Avg. Time to Fill</p>
                                <p className="text-4xl font-bold text-gray-900 dark:text-white">{recruitmentData.timeToFill}</p>
                            </div>
                            <div className="p-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg text-center">
                                <p className="text-sm text-gray-500 dark:text-gray-400">Offer Acceptance Rate</p>
                                <p className="text-4xl font-bold text-gray-900 dark:text-white">{recruitmentData.acceptanceRate}</p>
                            </div>
                        </div>
                        <div className="pt-8 text-gray-500 text-center">More charts in full report...</div>
                        <div className="text-right">
                            <Link to="/employees/analytics/recruitment" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline flex items-center justify-end">
                                Full Report <ArrowRightIcon />
                            </Link>
                        </div>
                    </div>
                 );
            case 'discipline':
                return (
                     <div className="space-y-6">
                        <div className="p-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg text-center">
                            <p className="text-sm text-gray-500 dark:text-gray-400">{selectedQuarter === 0 ? 'Open Cases this Year' : 'Open Cases this Quarter'}</p>
                            <p className="text-4xl font-bold text-gray-900 dark:text-white">{disciplineData.openCases}</p>
                        </div>
                        <div>
                            <h4 className="font-semibold text-center text-sm mb-4">{selectedQuarter === 0 ? 'Top Violations this Year' : 'Top Violations this Quarter'}</h4>
                            <SimpleBarChart data={disciplineData.commonViolations} />
                        </div>
                        <div className="text-right">
                            <Link to="/employees/analytics/discipline" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline flex items-center justify-end">
                                Full Report <ArrowRightIcon />
                            </Link>
                        </div>
                    </div>
                );
            default: return null;
        }
    }


    return (
        <Card title="Quick Analytics Preview" className="!p-0">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Year</label>
                        <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                            {availableYears.map(year => <option key={year} value={year}>{year}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Quarter</label>
                        <select value={selectedQuarter} onChange={e => setSelectedQuarter(Number(e.target.value))} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white">
                            <option value="0">All Quarters (Yearly)</option>
                            <option value="1">Q1 (Jan-Mar)</option>
                            <option value="2">Q2 (Apr-Jun)</option>
                            <option value="3">Q3 (Jul-Sep)</option>
                            <option value="4">Q4 (Oct-Dec)</option>
                        </select>
                    </div>
                </div>
            </div>
             <div className="px-4 border-b border-gray-200 dark:border-gray-700">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    <button onClick={() => setActiveTab('employees')} className={tabClass('employees')}>Employees</button>
                    <button onClick={() => setActiveTab('recruitment')} className={tabClass('recruitment')}>Recruitment</button>
                    <button onClick={() => setActiveTab('discipline')} className={tabClass('discipline')}>Discipline</button>
                </nav>
            </div>
            <div className="p-6">
                {renderTabContent()}
            </div>
        </Card>
    );
};

export default QuickAnalyticsPreview;