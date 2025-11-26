
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Application, ApplicationStage, Candidate, CandidateSource, JobPostStatus, Role, BusinessUnit, JobRequisition, Interview } from '../../types';
import { mockApplications, mockCandidates, mockJobPosts, mockJobRequisitions, mockBusinessUnits, mockDepartments, mockInterviews } from '../../services/mockData';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Textarea from '../../components/ui/Textarea';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { useSettings } from '../../context/SettingsContext';
import RichTextEditor from '../../components/ui/RichTextEditor';
import AddApplicantModal from '../../components/recruitment/AddApplicantModal';
import ApplicantKanbanBoard from '../../components/recruitment/ApplicantKanbanBoard';
import ApplicantDetailModal from '../../components/recruitment/ApplicantDetailModal';
import { logActivity } from '../../services/auditService';
import InterviewSchedulerModal from '../../components/recruitment/InterviewSchedulerModal';
import RejectionEmailModal from '../../components/recruitment/RejectionEmailModal';

export interface EnrichedApplication extends Application {
    candidateName: string;
    jobTitle: string;
    businessUnitName: string;
    businessUnitId?: string;
    departmentName: string;
    candidateSource?: CandidateSource;
}

// --- ICONS ---
const EditIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>;
const ViewColumnsIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2-2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h5a2 2 0 00-2-2V7a2 2 0 00-2-2h-5a2 2 0 00-2 2m0 10V7m0 10h5" /></svg>;
const ListBulletIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>;

// --- LIST VIEW ---
const getStageColor = (stage: ApplicationStage) => ({
    [ApplicationStage.Hired]: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
    [ApplicationStage.Offer]: 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300',
    [ApplicationStage.Interview]: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
    [ApplicationStage.Rejected]: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
    [ApplicationStage.Withdrawn]: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
}[stage] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200');

const ApplicantListTable: React.FC<{ applications: EnrichedApplication[]; onRowClick: (app: EnrichedApplication) => void }> = ({ applications, onRowClick }) => (
    <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase">Candidate</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase">Position</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase">Business Unit</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase">Stage</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase">Applied</th>
                </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {applications.map(app => (
                    <tr key={app.id} onClick={() => onRowClick(app)} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                        <td className="px-6 py-4 whitespace-nowrap font-medium">{app.candidateName}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{app.jobTitle}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{app.businessUnitName}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm"><span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStageColor(app.stage)}`}>{app.stage}</span></td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{new Date(app.createdAt).toLocaleDateString()}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

// ----- MAIN COMPONENT -----
const Applicants: React.FC = () => {
    const { user } = useAuth();
    const { can, getAccessibleBusinessUnits } = usePermissions();
    const { settings, updateSettings } = useSettings();
    const [isEditingDesc, setIsEditingDesc] = useState(false);
    const [editText, setEditText] = useState('');

    const [applications, setApplications] = useState<Application[]>(mockApplications);
    const [selectedApplication, setSelectedApplication] = useState<EnrichedApplication | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    
    // Automation Modal States
    const [isSchedulerOpen, setIsSchedulerOpen] = useState(false);
    const [isRejectionModalOpen, setIsRejectionModalOpen] = useState(false);
    const [pendingAppId, setPendingAppId] = useState<string | null>(null);
    const [pendingStage, setPendingStage] = useState<ApplicationStage | null>(null);
    
    const [buFilter, setBuFilter] = useState<string>('');
    const [departmentFilter, setDepartmentFilter] = useState<string>('');
    const [yearFilter, setYearFilter] = useState<string>(new Date().getFullYear().toString());
    const [monthFilter, setMonthFilter] = useState<string>('all');
    const [view, setView] = useState<'kanban' | 'list'>('list');

    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(mockBusinessUnits), [getAccessibleBusinessUnits]);

    const isAdmin = user?.role === Role.Admin;
    const descriptionKey = 'recruitmentApplicantsDesc';
    const description = settings[descriptionKey] as string || '';
    
    const handleEditDesc = () => { setEditText(description); setIsEditingDesc(true); };
    const handleSaveDesc = () => { updateSettings({ [descriptionKey]: editText }); setIsEditingDesc(false); };

    // --- SYNC LOGIC START ---
    useEffect(() => {
        const syncFromStorage = () => {
            try {
                const storedApps = JSON.parse(localStorage.getItem('tng_applications') || '[]');
                const storedCands = JSON.parse(localStorage.getItem('tng_candidates') || '[]');
                
                let hasUpdates = false;
                // Merge new candidates first
                storedCands.forEach((cand: Candidate) => {
                    if (!mockCandidates.find(c => c.id === cand.id)) {
                        mockCandidates.push(cand);
                    }
                });

                // Merge new applications
                storedApps.forEach((app: Application) => {
                    if (!mockApplications.find(a => a.id === app.id)) {
                        mockApplications.push(app);
                        hasUpdates = true;
                    }
                });

                if (hasUpdates || mockApplications.length !== applications.length) {
                    setApplications([...mockApplications]);
                }
            } catch (e) {
                console.error("Error syncing applicant data:", e);
            }
        };

        // Initial Sync
        syncFromStorage();

        // Poll for changes (e.g. from another tab)
        const interval = setInterval(syncFromStorage, 2000);
        
        // Listen for storage event (immediate cross-tab sync)
        const handleStorage = (event: StorageEvent) => {
            if (event.key === 'tng_hris_db_update' || event.key === 'tng_applications') {
                syncFromStorage();
            }
        };
        window.addEventListener('storage', handleStorage);

        return () => {
            clearInterval(interval);
            window.removeEventListener('storage', handleStorage);
        };
    }, [applications.length]);
    // --- SYNC LOGIC END ---

    const enrichedApplications: EnrichedApplication[] = useMemo(() => {
        return applications.map(app => {
            const candidate = mockCandidates.find(c => c.id === app.candidateId);
            const jobPost = mockJobPosts.find(p => p.id === app.jobPostId);
            const requisition = mockJobRequisitions.find(r => r.id === app.requisitionId);
            const businessUnit = mockBusinessUnits.find(bu => bu.id === requisition?.businessUnitId);
            const department = mockDepartments.find(d => d.id === requisition?.departmentId);
            return {
                ...app,
                candidateName: candidate ? `${candidate.firstName} ${candidate.lastName}` : 'Unknown',
                jobTitle: jobPost?.title || 'N/A',
                businessUnitName: businessUnit?.name || 'N/A',
                businessUnitId: businessUnit?.id,
                departmentName: department?.name || 'N/A',
                candidateSource: candidate?.source,
            };
        }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }, [applications]);

    const departmentsForBU = useMemo(() => {
        if (!buFilter) return mockDepartments;
        return mockDepartments.filter(d => d.businessUnitId === buFilter);
    }, [buFilter]);

    const yearOptions = useMemo(() => {
        const years = new Set(enrichedApplications.map(app => new Date(app.createdAt).getFullYear()));
        years.add(new Date().getFullYear());
        return Array.from(years).sort((a, b) => b - a);
    }, [enrichedApplications]);
    
    const monthOptions = [{ value: 'all', name: 'All Months' }, ...Array.from({length: 12}, (_, i) => ({ value: (i+1).toString(), name: new Date(0, i).toLocaleString('default', { month: 'long' }) }))];

    const filteredApplications = useMemo(() => {
        const accessibleBuIds = new Set(accessibleBus.map(b => b.id));

        return enrichedApplications.filter(app => {
            // Scope Check
            if (app.businessUnitId && !accessibleBuIds.has(app.businessUnitId)) return false;

            const buName = mockBusinessUnits.find(b => b.id === buFilter)?.name;
            const deptName = mockDepartments.find(d => d.id === departmentFilter)?.name;
            
            const appDate = new Date(app.createdAt);
            const buMatch = !buFilter || app.businessUnitName === buName;
            const deptMatch = !departmentFilter || app.departmentName === deptName;
            const yearMatch = yearFilter === 'all' || appDate.getFullYear().toString() === yearFilter;
            const monthMatch = monthFilter === 'all' || (appDate.getMonth() + 1).toString() === monthFilter;
            return buMatch && deptMatch && yearMatch && monthMatch;
        });
    }, [enrichedApplications, buFilter, departmentFilter, yearFilter, monthFilter, accessibleBus]);

    const performStageUpdate = (appId: string, stage: ApplicationStage) => {
        const updated = applications.map(app => app.id === appId ? { ...app, stage, updatedAt: new Date() } : app);
        setApplications(updated);
        const mockIndex = mockApplications.findIndex(app => app.id === appId);
        if (mockIndex !== -1) mockApplications[mockIndex] = { ...mockApplications[mockIndex], stage, updatedAt: new Date() };
        logActivity(user, 'UPDATE', 'Application', appId, `Updated application stage to ${stage}`);
    };

    const handleUpdateStage = (applicationId: string, newStage: ApplicationStage) => {
        // --- Automation Logic ---
        
        if (newStage === ApplicationStage.Interview) {
            setPendingAppId(applicationId);
            setPendingStage(newStage);
            // Update state first so kanban reflects drop, then prompt
            performStageUpdate(applicationId, newStage);
            setTimeout(() => setIsSchedulerOpen(true), 200); // Slight delay for UX
            return;
        }

        if (newStage === ApplicationStage.Rejected) {
            setPendingAppId(applicationId);
            setPendingStage(newStage);
            setIsRejectionModalOpen(true);
            // Don't update stage yet, wait for confirmation/email send
            return;
        }
        
        // Standard update for other stages
        performStageUpdate(applicationId, newStage);
    };

    const handleSaveInterview = (interviewToSave: Interview) => {
        const newInterview = { ...interviewToSave, id: `INT-${Date.now()}`};
        mockInterviews.unshift(newInterview);
        setIsSchedulerOpen(false);
        setPendingAppId(null);
        setPendingStage(null);
        alert("Interview scheduled successfully.");
    };
    
    const handleRejectionComplete = () => {
        if (pendingAppId && pendingStage) {
            performStageUpdate(pendingAppId, pendingStage);
        }
        setIsRejectionModalOpen(false);
        setPendingAppId(null);
        setPendingStage(null);
    };


    const handleSaveApplicant = ({ candidateData, jobPostId, coverLetter }: { candidateData: Omit<Candidate, 'id'>, jobPostId: string, coverLetter: string }) => {
        const jobPost = mockJobPosts.find(post => post.id === jobPostId)!;
        const newCandidate: Candidate = { id: `CAND-${Date.now()}`, ...candidateData };
        mockCandidates.push(newCandidate);
        const newApplication: Application = { 
            id: `APP-${Date.now()}`, 
            candidateId: newCandidate.id, 
            jobPostId, 
            requisitionId: jobPost.requisitionId, 
            stage: ApplicationStage.New, 
            notes: coverLetter, // Map cover letter to notes
            createdAt: new Date(), 
            updatedAt: new Date() 
        };
        mockApplications.push(newApplication);
        setApplications(prev => [...prev, newApplication]);
        
        logActivity(user, 'CREATE', 'Application', newApplication.id, `Added new applicant: ${newCandidate.firstName} ${newCandidate.lastName}`);
        setIsAddModalOpen(false);
    };

    const viewButtonClass = (buttonView: 'kanban' | 'list') => `flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors ${view === buttonView ? 'bg-indigo-100 text-indigo-700 dark:bg-slate-700 dark:text-indigo-300 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`;
    const selectClasses = "mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white";

    // Helper to get a partial interview object with just appId pre-filled for the modal
    const pendingInterviewStub = useMemo(() => {
        if (!pendingAppId) return null;
        return { applicationId: pendingAppId } as any;
    }, [pendingAppId]);

    const pendingApplication = useMemo(() => {
        if (!pendingAppId) return null;
        return applications.find(a => a.id === pendingAppId) || null;
    }, [pendingAppId, applications]);


    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Applicant Tracking System</h1>
                 <div className="flex items-center space-x-2">
                    <Link to="/apply"><Button variant="secondary">View Applicant Page</Button></Link>
                    <Button onClick={() => setIsAddModalOpen(true)}>New Applicant</Button>
                </div>
            </div>
            
            {isEditingDesc ? (
                <div className="p-4 border rounded-lg bg-gray-50 dark:bg-slate-800/50 dark:border-slate-700 space-y-4">
                    <RichTextEditor label="Edit Description" value={editText} onChange={setEditText}/>
                    <div className="flex justify-end space-x-2"><Button variant="secondary" onClick={() => setIsEditingDesc(false)}>Cancel</Button><Button onClick={handleSaveDesc}>Save</Button></div>
                </div>
            ) : (
                <div className="relative group">
                    <div dangerouslySetInnerHTML={{ __html: description }} className="text-gray-600 dark:text-gray-400 mt-2"/>
                    {isAdmin && <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity"><Button size="sm" variant="secondary" onClick={handleEditDesc} title="Edit description"><EditIcon /></Button></div>}
                </div>
            )}

            <Card>
                <div className="p-4 grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                    <div>
                        <label htmlFor="bu-filter" className="block text-sm font-medium">Filter by Business Unit</label>
                        <select id="bu-filter" value={buFilter} onChange={e => { setBuFilter(e.target.value); setDepartmentFilter(''); }} className={selectClasses}>
                            <option value="">All Accessible</option>
                            {accessibleBus.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="dept-filter" className="block text-sm font-medium">Filter by Department</label>
                        <select id="dept-filter" value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)} className={selectClasses}>
                            <option value="">All Departments</option>
                            {departmentsForBU.map(dept => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="year-filter" className="block text-sm font-medium">Year</label>
                        <select id="year-filter" value={yearFilter} onChange={e => setYearFilter(e.target.value)} className={selectClasses}>
                            <option value="all">All Years</option>
                            {yearOptions.map(year => <option key={year} value={year}>{year}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="month-filter" className="block text-sm font-medium">Month</label>
                        <select id="month-filter" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className={selectClasses}>
                            {monthOptions.map(month => <option key={month.value} value={month.value}>{month.name}</option>)}
                        </select>
                    </div>
                    <div className="flex justify-end">
                        <div className="inline-flex space-x-1 p-1 bg-gray-200 dark:bg-slate-800 rounded-lg">
                            <button className={viewButtonClass('kanban')} onClick={() => setView('kanban')}><ViewColumnsIcon/>Kanban</button>
                            <button className={viewButtonClass('list')} onClick={() => setView('list')}><ListBulletIcon/>List</button>
                        </div>
                    </div>
                </div>
            </Card>

            {view === 'kanban' ? <ApplicantKanbanBoard applications={filteredApplications} onUpdateStage={handleUpdateStage} onCardClick={setSelectedApplication} /> : <ApplicantListTable applications={filteredApplications} onRowClick={setSelectedApplication}/>}
            {selectedApplication && <ApplicantDetailModal isOpen={!!selectedApplication} onClose={() => setSelectedApplication(null)} application={selectedApplication} />}
            <AddApplicantModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onSave={handleSaveApplicant} />

            {/* Automation Modals */}
            {isSchedulerOpen && (
                <InterviewSchedulerModal
                    isOpen={isSchedulerOpen}
                    onClose={() => { setIsSchedulerOpen(false); setPendingAppId(null); }}
                    interview={pendingInterviewStub}
                    onSave={handleSaveInterview}
                />
            )}

            {isRejectionModalOpen && (
                <RejectionEmailModal
                    isOpen={isRejectionModalOpen}
                    onClose={() => { setIsRejectionModalOpen(false); setPendingAppId(null); }}
                    application={pendingApplication}
                    onSend={handleRejectionComplete}
                />
            )}
        </div>
    );
};

export default Applicants;
