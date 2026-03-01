
import React, { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { JobRequisition, JobRequisitionStatus, Permission, Role, JobRequisitionRole, JobRequisitionStepStatus } from '../../types';
import { mockJobRequisitions, mockUsers, mockBusinessUnits, mockDepartments } from '../../services/mockData';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import EditableDescription from '../../components/ui/EditableDescription';
import RequisitionTable from '../../components/recruitment/RequisitionTable';
import RequisitionModal from '../../components/recruitment/RequisitionModal';
import RejectReasonModal from '../../components/feedback/RejectReasonModal';
import { logActivity } from '../../services/auditService';
import { fetchJobRequisitions, saveJobRequisition } from '../../services/jobRequisitionService';
import { supabase } from '../../services/supabaseClient';

const Requisitions: React.FC = () => {
    const { user } = useAuth();
    const { can } = usePermissions();
    const canCreate = can('Requisitions', Permission.Create) || can('Requisitions', Permission.Manage);
    const location = useLocation();
    const navigate = useNavigate();

    const [requisitions, setRequisitions] = useState<JobRequisition[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedRequisition, setSelectedRequisition] = useState<JobRequisition | null>(null);
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [businessUnits, setBusinessUnits] = useState(mockBusinessUnits);
    const [departments, setDepartments] = useState(mockDepartments);
    
    // State for filters
    const [searchTerm, setSearchTerm] = useState('');
    const [buFilter, setBuFilter] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState('');
    const [urgencyFilter, setUrgencyFilter] = useState('all');
    const [yearFilter, setYearFilter] = useState('all');
    const [monthFilter, setMonthFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');

    useEffect(() => {
        const loadReqs = async () => {
            try {
                const data = await fetchJobRequisitions();
                setRequisitions(data);
            } catch (err) {
                console.error('Failed to load job requisitions', err);
                setRequisitions(mockJobRequisitions);
            }
        };
        loadReqs();
    }, []);

    useEffect(() => {
        const loadMeta = async () => {
            try {
                const { data: buData, error: buErr } = await supabase.from('business_units').select('id, name, code');
                if (!buErr && buData && buData.length > 0) {
                    setBusinessUnits(buData.map((b: any) => ({ id: b.id, name: b.name, code: b.code || '' })));
                } else {
                    setBusinessUnits(mockBusinessUnits);
                }

                const { data: deptData, error: deptErr } = await supabase.from('departments').select('id, name, business_unit_id');
                if (!deptErr && deptData && deptData.length > 0) {
                    setDepartments(deptData.map((d: any) => ({ id: d.id, name: d.name, businessUnitId: d.business_unit_id })));
                } else {
                    setDepartments(mockDepartments);
                }
            } catch (err) {
                console.warn('Failed to load BU/Departments for requisitions filters', err);
                setBusinessUnits(mockBusinessUnits);
                setDepartments(mockDepartments);
            }
        };
        loadMeta();
    }, []);

    const handleOpenModal = React.useCallback((req: JobRequisition | null) => {
        setSelectedRequisition(req);
        setIsModalOpen(true);
    }, []);

    useEffect(() => {
        if (location.state?.openNewReqModal) {
            handleOpenModal(null);
            // Clear state to prevent re-opening on refresh
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state, navigate, handleOpenModal]);


    const departmentsForBU = useMemo(() => {
        if (!buFilter) return departments;
        return departments.filter(d => d.businessUnitId === buFilter);
    }, [buFilter, departments]);

    const yearOptions = useMemo(() => {
        const years = new Set(mockJobRequisitions.map(r => new Date(r.createdAt).getFullYear()));
        const currentYear = new Date().getFullYear();
        years.add(currentYear);
        return Array.from(years).sort((a, b) => b - a);
    }, []);

    const monthOptions = [
        { value: '1', name: 'January' }, { value: '2', name: 'February' }, { value: '3', name: 'March' },
        { value: '4', name: 'April' }, { value: '5', name: 'May' }, { value: '6', name: 'June' },
        { value: '7', name: 'July' }, { value: '8', name: 'August' }, { value: '9', name: 'September' },
        { value: '10', name: 'October' }, { value: '11', name: 'November' }, { value: '12', name: 'December' }
    ];

    const statusOptions = Object.values(JobRequisitionStatus);

    const filteredRequisitions = useMemo(() => {
        return requisitions.filter(req => {
            const searchMatch = req.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                req.reqCode.toLowerCase().includes(searchTerm.toLowerCase());
            const buMatch = !buFilter || req.businessUnitId === buFilter;
            const deptMatch = !departmentFilter || req.departmentId === departmentFilter;
            const urgencyMatch = urgencyFilter === 'all' || (urgencyFilter === 'urgent' && req.isUrgent);
            
            const reqDate = req.createdAt ? new Date(req.createdAt) : new Date();
            const yearMatch = yearFilter === 'all' || reqDate.getFullYear().toString() === yearFilter;
            const monthMatch = monthFilter === 'all' || (reqDate.getMonth() + 1).toString() === monthFilter;
            const statusMatch = statusFilter === 'all' || req.status === statusFilter;

            return searchMatch && buMatch && deptMatch && urgencyMatch && yearMatch && monthMatch && statusMatch;
        });
    }, [requisitions, searchTerm, buFilter, departmentFilter, urgencyFilter, yearFilter, monthFilter, statusFilter]);

    const handleCloseModal = () => {
        setSelectedRequisition(null);
        setIsModalOpen(false);
    };

    const handleSaveRequisition = async (reqToSave: JobRequisition) => {
        try {
            const saved = await saveJobRequisition(reqToSave);
            setRequisitions(prev => {
                const rest = prev.filter(r => r.id !== saved.id);
                return [saved, ...rest];
            });
            logActivity(user, reqToSave.id ? 'UPDATE' : 'CREATE', 'JobRequisition', saved.id, `${reqToSave.id ? 'Updated' : 'Created'} requisition ${saved.reqCode || saved.id}`);
            handleCloseModal();
        } catch (err: any) {
            alert(err?.message || 'Failed to save requisition.');
        }
    };

    const handleApprove = async (requisitionId: string) => {
        if (!user) return;
        const existing = requisitions.find(r => r.id === requisitionId);
        if (!existing) return;

        const updatedReq = { ...existing };
        const userStepIndex = updatedReq.routingSteps.findIndex(s => s.userId === user.id && s.status === JobRequisitionStepStatus.Pending);
        const isHrApprover = user.role === Role.HRManager || user.role === Role.HRStaff || user.role === Role.Admin;

        if (userStepIndex > -1) {
            updatedReq.routingSteps[userStepIndex].status = JobRequisitionStepStatus.Approved;
            updatedReq.routingSteps[userStepIndex].timestamp = new Date();
            logActivity(user, 'APPROVE', 'JobRequisition', requisitionId, `Approved requisition step.`);
        } else if (isHrApprover) {
            updatedReq.status = JobRequisitionStatus.Approved;
            logActivity(user, 'APPROVE', 'JobRequisition', requisitionId, `Job Requisition approved.`);
        }
        
        if (updatedReq.routingSteps.length > 0) {
            const allStepsApproved = updatedReq.routingSteps.every(s => s.status === JobRequisitionStepStatus.Approved);
            const hasFinalApprovers = updatedReq.routingSteps.some(s => s.role === JobRequisitionRole.Final);
            if (allStepsApproved && hasFinalApprovers) {
                updatedReq.status = JobRequisitionStatus.Approved;
                logActivity(user, 'APPROVE', 'JobRequisition', requisitionId, `Job Requisition fully approved and opened.`);
            }
        }
        
        try {
            const saved = await saveJobRequisition(updatedReq);
            setRequisitions(prev => {
                const rest = prev.filter(r => r.id !== saved.id);
                return [saved, ...rest];
            });
            handleCloseModal();
        } catch (err: any) {
            alert(err?.message || 'Failed to approve requisition.');
        }
    };

    const handleOpenRejectModal = (requisition: JobRequisition) => {
        setSelectedRequisition(requisition);
        setIsRejectModalOpen(true);
    };

    const handleConfirmReject = async (reason: string) => {
        if (!user || !selectedRequisition) return;
        const existing = requisitions.find(r => r.id === selectedRequisition.id);
        if (!existing) return;

        const updatedReq = { ...existing };
        const userStepIndex = updatedReq.routingSteps.findIndex(s => s.userId === user.id && s.status === JobRequisitionStepStatus.Pending);

        if (userStepIndex > -1) {
            updatedReq.routingSteps[userStepIndex].status = JobRequisitionStepStatus.Rejected;
            updatedReq.routingSteps[userStepIndex].timestamp = new Date();
            updatedReq.routingSteps[userStepIndex].notes = reason;
        }
        
        updatedReq.status = JobRequisitionStatus.Rejected;
        logActivity(user, 'REJECT', 'JobRequisition', selectedRequisition.id, `Rejected requisition. Reason: ${reason}`);
        
        try {
            const saved = await saveJobRequisition(updatedReq);
            setRequisitions(prev => {
                const rest = prev.filter(r => r.id !== saved.id);
                return [saved, ...rest];
            });
            setIsRejectModalOpen(false);
            handleCloseModal();
        } catch (err: any) {
            alert(err?.message || 'Failed to reject requisition.');
        }
    };

    const handleAddFinalApprovers = async (requisitionId: string, finalApproverIds: string[]) => {
        const existing = requisitions.find(r => r.id === requisitionId);
        if (!existing) return;
        
        const updatedReq = { ...existing };
        const finalSteps = finalApproverIds.map((id, index) => {
            const approver = mockUsers.find(u => u.id === id);
            return {
                id: `req-step-${requisitionId}-final-${index}`,
                userId: id,
                name: approver?.name || 'Final Approver',
                role: JobRequisitionRole.Final,
                status: JobRequisitionStepStatus.Pending,
                order: 2 // All final approvers are at the same level
            }
        });

        updatedReq.routingSteps.push(...finalSteps);
        
        try {
            const saved = await saveJobRequisition(updatedReq);
            setRequisitions(prev => {
                const rest = prev.filter(r => r.id !== saved.id);
                return [saved, ...rest];
            });
            logActivity(user!, 'UPDATE', 'JobRequisition', requisitionId, `Added ${finalSteps.length} final approver(s).`);
            handleCloseModal();
        } catch (err: any) {
            alert(err?.message || 'Failed to add final approvers.');
        }
    };


    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Job Requisitions</h1>
                {canCreate && (
                    <Button onClick={() => handleOpenModal(null)}>Create Requisition</Button>
                )}
            </div>
            
            <EditableDescription descriptionKey="recruitmentRequisitionsDesc" />

            <Card className="!p-0">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="lg:col-span-2">
                        <Input 
                            label="Search by Title or Code"
                            id="req-search"
                            placeholder="Search..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Unit</label>
                        <select value={buFilter} onChange={e => { setBuFilter(e.target.value); setDepartmentFilter(''); }} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option value="">All Business Units</option>
                            {businessUnits.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Department</label>
                        <select value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option value="">All Departments</option>
                            {departmentsForBU.map(dept => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Year</label>
                        <select value={yearFilter} onChange={e => setYearFilter(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option value="all">All Years</option>
                            {yearOptions.map(year => <option key={year} value={year}>{year}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Month</label>
                        <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option value="all">All Months</option>
                            {monthOptions.map(month => <option key={month.value} value={month.value}>{month.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option value="all">All Statuses</option>
                            {statusOptions.map(status => <option key={status} value={status}>{status}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Urgency</label>
                        <select value={urgencyFilter} onChange={e => setUrgencyFilter(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option value="all">Show All</option>
                            <option value="urgent">Urgent Only</option>
                        </select>
                    </div>
                </div>
                <RequisitionTable 
                    requisitions={filteredRequisitions} 
                    onEdit={handleOpenModal} 
                    businessUnits={businessUnits}
                    departments={departments}
                />
            </Card>

            {isModalOpen && (
                <RequisitionModal
                    isOpen={isModalOpen}
                    onClose={handleCloseModal}
                    requisition={selectedRequisition}
                    onSave={handleSaveRequisition}
                    onApprove={handleApprove}
                    onReject={handleOpenRejectModal}
                    onAddFinalApprovers={handleAddFinalApprovers}
                />
            )}
            
            <RejectReasonModal
                isOpen={isRejectModalOpen}
                onClose={() => setIsRejectModalOpen(false)}
                onSubmit={handleConfirmReject}
                title="Reason for Rejection"
                prompt="Please provide a reason for rejecting this requisition."
            />
        </div>
    );
};

export default Requisitions;
