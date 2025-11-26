
import React, { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { User } from '../../types';

interface ComplianceModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    dueDate: Date;
    missingUsers: { user: User; role?: string; subjectName?: string }[]; // Enhanced to show context for evaluations
    type: 'Survey' | 'Evaluation';
}

const ClockIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const MailIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>;

const ComplianceModal: React.FC<ComplianceModalProps> = ({ isOpen, onClose, title, dueDate, missingUsers, type }) => {
    const [isReminding, setIsReminding] = useState(false);
    
    const isOverdue = new Date() > new Date(dueDate);

    const handleRemindAll = () => {
        setIsReminding(true);
        setTimeout(() => {
            alert(`Reminders sent to ${missingUsers.length} users.`);
            setIsReminding(false);
            onClose();
        }, 1000);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Compliance Report"
            size="lg"
            footer={
                <div className="flex justify-end w-full space-x-2">
                    <Button variant="secondary" onClick={onClose}>Close</Button>
                    <Button onClick={handleRemindAll} isLoading={isReminding} disabled={missingUsers.length === 0}>
                        <MailIcon /> Remind All
                    </Button>
                </div>
            }
        >
            <div className="space-y-4">
                <div className="flex justify-between items-start p-4 bg-gray-50 dark:bg-slate-700/50 rounded-lg border dark:border-gray-600">
                    <div>
                        <h3 className="font-bold text-gray-900 dark:text-white">{title}</h3>
                        <div className="flex items-center mt-1 text-sm">
                             <ClockIcon />
                             <span className={`font-medium ${isOverdue ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
                                Due: {new Date(dueDate).toLocaleDateString()} {isOverdue ? '(Overdue)' : ''}
                             </span>
                        </div>
                    </div>
                    <div className="text-right">
                         <p className="text-2xl font-bold text-red-600 dark:text-red-400">{missingUsers.length}</p>
                         <p className="text-xs text-gray-500 uppercase tracking-wider">Missing</p>
                    </div>
                </div>

                <div className="overflow-hidden border rounded-lg dark:border-gray-700">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-slate-800">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    {type === 'Evaluation' ? 'Evaluator' : 'Employee'}
                                </th>
                                {type === 'Evaluation' && (
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Missing Review For
                                    </th>
                                )}
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Department
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-slate-900 divide-y divide-gray-200 dark:divide-gray-700 max-h-64 overflow-y-auto block w-full">
                            {/* Note: Making tbody block for scrolling is a quick CSS hack, for production use a wrapper div */}
                            {missingUsers.length > 0 ? (
                                missingUsers.map((item, idx) => (
                                    <tr key={`${item.user.id}-${idx}`} className="table w-full table-fixed">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-xs font-bold">
                                                    {item.user.name.charAt(0)}
                                                </div>
                                                <div className="ml-3">
                                                    <div className="text-sm font-medium text-gray-900 dark:text-white">{item.user.name}</div>
                                                    <div className="text-xs text-gray-500">{item.user.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        {type === 'Evaluation' && (
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 dark:text-red-400">
                                                {item.subjectName}
                                            </td>
                                        )}
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {item.user.department}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr className="table w-full table-fixed">
                                    <td colSpan={3} className="px-6 py-8 text-center text-sm text-green-600 dark:text-green-400 font-medium">
                                        All required submissions have been received!
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </Modal>
    );
};

export default ComplianceModal;
