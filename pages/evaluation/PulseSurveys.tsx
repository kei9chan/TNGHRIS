
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { PulseSurvey, PulseSurveyStatus, Permission, User, Role } from '../../types';
import { usePermissions } from '../../hooks/usePermissions';
import ComplianceModal from '../../components/evaluation/ComplianceModal';
import { supabase } from '../../services/supabaseClient';

const PulseSurveys: React.FC = () => {
    const { can } = usePermissions();
    const canManage = can('PulseSurvey', Permission.Manage);
    const canView = can('PulseSurvey', Permission.View);

    const [surveys, setSurveys] = useState<PulseSurvey[]>([]);
    const [sectionCounts, setSectionCounts] = useState<Record<string, number>>({});
    const [responsesBySurvey, setResponsesBySurvey] = useState<Record<string, Set<string>>>({});
    const [users, setUsers] = useState<User[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    
    // Compliance Modal State
    const [isComplianceModalOpen, setIsComplianceModalOpen] = useState(false);
    const [selectedSurveyForCompliance, setSelectedSurveyForCompliance] = useState<PulseSurvey | null>(null);
    const [missingRespondents, setMissingRespondents] = useState<{ user: User }[]>([]);

    const getStatusColor = (status: PulseSurveyStatus) => {
        switch (status) {
            case PulseSurveyStatus.Active: return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
            case PulseSurveyStatus.Draft: return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300';
            case PulseSurveyStatus.Closed: return 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("Are you sure you want to delete this survey?")) return;
        const { error: delErr } = await supabase.from('pulse_surveys').delete().eq('id', id);
        if (delErr) {
            alert(`Failed to delete: ${delErr.message}`);
            return;
        }
        setSurveys(prev => prev.filter(s => s.id !== id));
    };

    const handleViewCompliance = (survey: PulseSurvey) => {
        // 1. Identify target employees (Active and non-admins)
        let targets = users.filter(u => u.status === 'Active' && u.role !== Role.Admin);
        if (survey.targetDepartments && survey.targetDepartments.length > 0) {
            targets = targets.filter(u => u.departmentId && survey.targetDepartments!.includes(u.departmentId));
        }

        // 2. Identify who has responded
        const respondentIds = responsesBySurvey[survey.id] || new Set<string>();

        // 3. Find missing
        const missing = targets
            .filter(u => !respondentIds.has(u.id))
            .map(u => ({ user: u }));
            
        setMissingRespondents(missing);
        setSelectedSurveyForCompliance(survey);
        setIsComplianceModalOpen(true);
    };

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);
            const [surveysRes, sectionsRes, responsesRes, usersRes] = await Promise.all([
                supabase.from('pulse_surveys').select('*').order('created_at', { ascending: false }),
                supabase.from('pulse_survey_sections').select('id, survey_id'),
                supabase.from('pulse_survey_responses').select('survey_id, respondent_id'),
                supabase.from('hris_users').select('id, full_name, first_name, last_name, email, role, status, department_id, business_unit_id'),
            ]);

            if (surveysRes.error || sectionsRes.error || responsesRes.error || usersRes.error) {
                setError(
                    surveysRes.error?.message ||
                    sectionsRes.error?.message ||
                    responsesRes.error?.message ||
                    usersRes.error?.message ||
                    'Failed to load surveys.'
                );
                setLoading(false);
                return;
            }

            const secCountMap: Record<string, number> = {};
            (sectionsRes.data || []).forEach((s: any) => {
                secCountMap[s.survey_id] = (secCountMap[s.survey_id] || 0) + 1;
            });
            setSectionCounts(secCountMap);

            const respMap: Record<string, Set<string>> = {};
            (responsesRes.data || []).forEach((r: any) => {
                if (!respMap[r.survey_id]) respMap[r.survey_id] = new Set();
                respMap[r.survey_id].add(r.respondent_id);
            });
            setResponsesBySurvey(respMap);

            setUsers((usersRes.data || []).map((u: any) => {
                const composedName = u.full_name || [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
                return {
                    id: u.id,
                    name: composedName || 'Unknown',
                    email: u.email || '',
                    role: u.role || Role.Employee,
                    status: u.status || 'Active',
                    businessUnitId: u.business_unit_id || undefined,
                    departmentId: u.department_id || undefined,
                } as User;
            }));

            setSurveys((surveysRes.data || []).map((s: any) => ({
                id: s.id,
                title: s.title,
                description: s.description || '',
                startDate: s.start_date ? new Date(s.start_date) : new Date(),
                endDate: s.end_date ? new Date(s.end_date) : undefined,
                status: s.status as PulseSurveyStatus,
                isAnonymous: !!s.is_anonymous,
                sections: [], // sections not needed on this list view; count shown via sectionCounts
                targetDepartments: s.target_department_ids || [],
                createdByUserId: s.created_by_user_id || '',
                createdAt: s.created_at ? new Date(s.created_at) : new Date(),
            } as PulseSurvey)));

            setLoading(false);
        };
        loadData();
    }, []);

    const sectionsCountFor = (surveyId: string) => sectionCounts[surveyId] ?? 0;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Pulse Surveys</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Gauge employee sentiment and engagement with regular pulse checks.</p>
                </div>
                {canManage && canView && (
                    <Link to="/evaluation/pulse/new">
                        <Button>Create Engagement Survey</Button>
                    </Link>
                )}
            </div>

            {error && (
                <Card>
                    <div className="p-4 text-red-600 dark:text-red-400 text-sm">{error}</div>
                </Card>
            )}
            {!canView && (
                <Card>
                    <div className="p-6 text-center text-gray-600 dark:text-gray-300">
                        You do not have permission to view pulse surveys.
                    </div>
                </Card>
            )}
            {canView && (
            <Card>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Survey Title</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Start Date</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">End Date</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                                <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {loading && (
                                <tr>
                                    <td colSpan={6} className="text-center py-10 text-gray-500 dark:text-gray-400">
                                        Loading surveys...
                                    </td>
                                </tr>
                            )}
                            {!loading && surveys.map(survey => {
                                const isOverdue = survey.endDate && new Date() > new Date(survey.endDate) && survey.status !== PulseSurveyStatus.Closed;
                                
                                return (
                                <tr key={survey.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900 dark:text-white">{survey.title}</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">{sectionsCountFor(survey.id)} Sections</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <div className="flex items-center space-x-2">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(survey.status)}`}>
                                                {survey.status}
                                            </span>
                                            {isOverdue && <span className="text-xs text-red-500 font-bold">Overdue</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(survey.startDate).toLocaleDateString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{survey.endDate ? new Date(survey.endDate).toLocaleDateString() : '-'}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {survey.isAnonymous ? (
                                            <span className="flex items-center text-indigo-600 dark:text-indigo-400"><span className="mr-1">🔒</span> Anonymous</span>
                                        ) : 'Identified'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex justify-end space-x-2">
                                            {(survey.status === PulseSurveyStatus.Active || survey.status === PulseSurveyStatus.Closed) && canManage && (
                                                <>
                                                    <Button size="sm" variant="secondary" onClick={() => handleViewCompliance(survey)} title="View who hasn't responded">
                                                        Compliance
                                                    </Button>
                                                    <Link to={`/evaluation/pulse/results/${survey.id}`}>
                                                        <Button size="sm" variant="success">Results</Button>
                                                    </Link>
                                                </>
                                            )}
                                            {canManage && (
                                                <Link to={`/evaluation/pulse/edit/${survey.id}`}>
                                                    <Button size="sm" variant="secondary">Edit</Button>
                                                </Link>
                                            )}
                                            {canManage && (
                                                <Button size="sm" variant="danger" onClick={() => handleDelete(survey.id)}>Delete</Button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )})}
                            {!loading && surveys.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="text-center py-10 text-gray-500 dark:text-gray-400">
                                        No surveys created yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
            )}

            {selectedSurveyForCompliance && (
                <ComplianceModal
                    isOpen={isComplianceModalOpen}
                    onClose={() => setIsComplianceModalOpen(false)}
                    title={`Missing Respondents: ${selectedSurveyForCompliance.title}`}
                    dueDate={selectedSurveyForCompliance.endDate || new Date()}
                    missingUsers={missingRespondents}
                    type="Survey"
                />
            )}
        </div>
    );
};

export default PulseSurveys;
