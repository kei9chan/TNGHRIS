
import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { mockPulseSurveys, mockSurveyResponses, mockUsers } from '../../services/mockData';
import { PulseSurvey, PulseSurveyStatus, Permission, User } from '../../types';
import { usePermissions } from '../../hooks/usePermissions';
import ComplianceModal from '../../components/evaluation/ComplianceModal';

const PulseSurveys: React.FC = () => {
    const { can } = usePermissions();
    const canManage = can('PulseSurvey', Permission.Manage);

    const [surveys, setSurveys] = useState<PulseSurvey[]>(mockPulseSurveys);
    
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

    const handleDelete = (id: string) => {
        if (window.confirm("Are you sure you want to delete this survey?")) {
            setSurveys(prev => prev.filter(s => s.id !== id));
            const index = mockPulseSurveys.findIndex(s => s.id === id);
            if(index > -1) mockPulseSurveys.splice(index, 1);
        }
    };

    const handleViewCompliance = (survey: PulseSurvey) => {
        // 1. Identify Target Employees
        // Logic: If targetDepartments is empty, it's everyone. Otherwise filter by department.
        let targets = mockUsers.filter(u => u.status === 'Active' && u.role !== 'Admin'); // Assuming Admins don't take surveys usually
        
        if (survey.targetDepartments && survey.targetDepartments.length > 0) {
             targets = targets.filter(u => survey.targetDepartments?.includes(u.department));
        }

        // 2. Identify who has responded
        const respondentIds = new Set(
            mockSurveyResponses
                .filter(r => r.surveyId === survey.id)
                .map(r => r.respondentId)
        );

        // 3. Find missing
        const missing = targets
            .filter(u => !respondentIds.has(u.id))
            .map(u => ({ user: u }));
        
        setMissingRespondents(missing);
        setSelectedSurveyForCompliance(survey);
        setIsComplianceModalOpen(true);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Pulse Surveys</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Gauge employee sentiment and engagement with regular pulse checks.</p>
                </div>
                {canManage && (
                    <Link to="/evaluation/pulse/new">
                        <Button>Create Engagement Survey</Button>
                    </Link>
                )}
            </div>

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
                            {surveys.map(survey => {
                                const isOverdue = survey.endDate && new Date() > new Date(survey.endDate) && survey.status !== PulseSurveyStatus.Closed;
                                
                                return (
                                <tr key={survey.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900 dark:text-white">{survey.title}</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">{survey.sections.length} Sections</div>
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
                            {surveys.length === 0 && (
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
