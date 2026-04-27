import React, { useMemo, useState, useEffect } from 'react';
import StatCard from '../../components/dashboard/StatCard';
import { OfferStatus, ApplicationStage, JobRequisition, BusinessUnit, Department, Application, Offer } from '../../types';
import SimplePieChart from '../../components/analytics/SimplePieChart';
import AnalyticsCard from '../../components/analytics/AnalyticsCard';
import Card from '../../components/ui/Card';
import EditableDescription from '../../components/ui/EditableDescription';
import { supabase } from '../../services/supabaseClient';

const ClockIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const DocumentCheckIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;

const RecruitmentAnalytics: React.FC = () => {
    const [buFilter, setBuFilter] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState('');

    const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [jobRequisitions, setJobRequisitions] = useState<JobRequisition[]>([]);
    const [applications, setApplications] = useState<Application[]>([]);
    const [offers, setOffers] = useState<Offer[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            try {
                const [buRes, deptRes, reqRes, appRes, offerRes] = await Promise.all([
                    supabase.from('business_units').select('*'),
                    supabase.from('departments').select('*'),
                    supabase.from('job_requisitions').select('*'),
                    supabase.from('job_applications').select('*'),
                    supabase.from('job_offers').select('*')
                ]);

                if (buRes.data) {
                    setBusinessUnits(buRes.data.map(bu => ({
                        id: bu.id,
                        name: bu.name,
                        code: bu.code || '',
                        description: bu.description || '',
                        status: bu.status,
                        headId: bu.head_id,
                        companyId: bu.company_id,
                        createdAt: new Date(bu.created_at),
                        updatedAt: new Date(bu.updated_at),
                    })));
                }
                
                if (deptRes.data) {
                    setDepartments(deptRes.data.map(d => ({
                        id: d.id,
                        name: d.name,
                        code: d.code || '',
                        businessUnitId: d.business_unit_id,
                        description: d.description || '',
                        status: d.status,
                        headId: d.head_id,
                        createdAt: new Date(d.created_at),
                        updatedAt: new Date(d.updated_at),
                    })));
                }

                if (reqRes.data) {
                    setJobRequisitions(reqRes.data.map(r => ({
                        id: r.id,
                        title: r.title,
                        reqCode: r.req_code || '',
                        businessUnitId: r.business_unit_id,
                        departmentId: r.department_id,
                        createdAt: new Date(r.created_at),
                    } as JobRequisition)));
                }

                if (appRes.data) {
                    setApplications(appRes.data.map(a => ({
                        id: a.id,
                        requisitionId: a.requisition_id,
                        stage: a.stage,
                        updatedAt: new Date(a.updated_at || a.created_at),
                    } as Application)));
                }

                if (offerRes.data) {
                    setOffers(offerRes.data.map(o => ({
                        id: o.id,
                        applicationId: o.application_id,
                        status: o.status,
                    } as Offer)));
                }
            } catch (error) {
                console.error("Error loading analytics data:", error);
            } finally {
                setIsLoading(false);
            }
        };

        loadData();
    }, []);

    const departmentsForBU = useMemo(() => {
        if (!buFilter) {
            return departments;
        }
        return departments.filter(d => d.businessUnitId === buFilter);
    }, [buFilter, departments]);

    const filteredRequisitionIds = useMemo(() => {
        if (!buFilter && !departmentFilter) {
            return new Set(jobRequisitions.map(r => r.id));
        }

        return new Set(jobRequisitions
            .filter(req => {
                const buMatch = !buFilter || req.businessUnitId === buFilter;
                const deptMatch = !departmentFilter || req.departmentId === departmentFilter;
                return buMatch && deptMatch;
            })
            .map(r => r.id)
        );
    }, [buFilter, departmentFilter, jobRequisitions]);

    const timeToFill = useMemo(() => {
        const hiredApps = applications.filter(app => 
            app.stage === ApplicationStage.Hired && filteredRequisitionIds.has(app.requisitionId)
        );

        if (hiredApps.length === 0) return 0;

        const totalDays = hiredApps.reduce((sum, app) => {
            const requisition = jobRequisitions.find(r => r.id === app.requisitionId);
            if (!requisition) return sum;
            
            const diffTime = Math.abs(new Date(app.updatedAt).getTime() - new Date(requisition.createdAt).getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            return sum + diffDays;
        }, 0);

        return Math.round(totalDays / hiredApps.length);
    }, [filteredRequisitionIds, applications, jobRequisitions]);

    const offerAcceptanceData = useMemo(() => {
        const relevantOffers = offers.filter(offer => {
            const application = applications.find(app => app.id === offer.applicationId);
            return application && filteredRequisitionIds.has(application.requisitionId);
        });
        
        const sentOrBeyond = relevantOffers.filter(o => o.status !== OfferStatus.Draft);
        const accepted = sentOrBeyond.filter(o => [OfferStatus.Signed, OfferStatus.Converted].includes(o.status)).length;
        const declined = sentOrBeyond.filter(o => o.status === OfferStatus.Declined).length;
        
        const total = accepted + declined;
        const rate = total > 0 ? (accepted / total) * 100 : 0;

        return {
            rate: rate.toFixed(1),
            chartData: [
                { label: 'Accepted', value: accepted, color: 'bg-green-500' },
                { label: 'Declined', value: declined, color: 'bg-red-500' }
            ]
        };
    }, [filteredRequisitionIds, offers, applications]);

    if (isLoading) {
        return <div className="p-8 text-center text-gray-500 dark:text-gray-400">Loading analytics...</div>;
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Recruitment Analytics</h1>
            <EditableDescription descriptionKey="analyticsRecruitmentDesc" />

            <Card>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Unit</label>
                        <select 
                            value={buFilter} 
                            onChange={e => { setBuFilter(e.target.value); setDepartmentFilter(''); }} 
                            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                        >
                            <option value="">All Business Units</option>
                            {businessUnits.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Department</label>
                        <select 
                            value={departmentFilter} 
                            onChange={e => setDepartmentFilter(e.target.value)} 
                            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                        >
                            <option value="">All Departments</option>
                            {departmentsForBU.map(dept => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
                        </select>
                    </div>
                </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <StatCard 
                    title="Average Time to Fill"
                    value={`${timeToFill} days`}
                    icon={<ClockIcon />}
                    colorClass="bg-blue-500"
                />
                <StatCard 
                    title="Offer Acceptance Rate"
                    value={`${offerAcceptanceData.rate}%`}
                    icon={<DocumentCheckIcon />}
                    colorClass="bg-green-500"
                />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <AnalyticsCard title="Offer Acceptance Rate">
                    <SimplePieChart data={offerAcceptanceData.chartData} />
                </AnalyticsCard>
                <AnalyticsCard title="Cost Per Hire">
                    <div className="h-64 flex items-center justify-center text-gray-500">Coming Soon</div>
                </AnalyticsCard>
            </div>
        </div>
    );
};

export default RecruitmentAnalytics;