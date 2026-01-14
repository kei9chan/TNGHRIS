import React, { useState, useEffect, useMemo } from 'react';
import { Interview, InterviewType, User, InterviewStatus } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';

interface InterviewSchedulerModalProps {
    isOpen: boolean;
    onClose: () => void;
    interview: Interview | null;
    onSave: (interview: Interview) => void;
    candidateOptions: { appId: string; label: string }[];
    users: User[];
}

const InterviewSchedulerModal: React.FC<InterviewSchedulerModalProps> = ({ isOpen, onClose, interview, onSave, candidateOptions, users }) => {
    const [current, setCurrent] = useState<Partial<Interview>>(interview || {});
    const [panelSearchTerm, setPanelSearchTerm] = useState('');

    const potentialInterviewers = useMemo(() => {
        return users;
    }, [users]);

    const displayedInterviewers = useMemo(() => {
        const lowercasedFilter = panelSearchTerm.toLowerCase();
        return potentialInterviewers.filter(interviewer => {
            const matchesSearch = interviewer.name.toLowerCase().includes(lowercasedFilter);
            const isSelected = current.panelUserIds?.includes(interviewer.id);
            return matchesSearch || isSelected;
        });
    }, [panelSearchTerm, potentialInterviewers, current.panelUserIds]);

    useEffect(() => {
        if (isOpen) {
            const now = new Date();
            now.setMinutes(0);
            now.setSeconds(0);
            const end = new Date(now.getTime() + 60 * 60 * 1000);

            setCurrent(interview || {
                interviewType: InterviewType.Virtual,
                scheduledStart: now,
                scheduledEnd: end,
                panelUserIds: [],
                status: InterviewStatus.Scheduled,
            });
            setPanelSearchTerm('');
        }
    }, [interview, isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setCurrent(prev => ({ ...prev, [name]: value }));
    };

    const handleDateTimeChange = (field: 'scheduledStart' | 'scheduledEnd', value: string) => {
        const datePart = (field === 'scheduledStart' ? current.scheduledStart : current.scheduledEnd) || new Date();
        const [hours, minutes] = value.split(':').map(Number);
        datePart.setHours(hours, minutes);
        setCurrent(prev => ({ ...prev, [field]: new Date(datePart) }));
    };

    const handleDateChange = (value: string) => {
        const newDate = new Date(value);
        const start = current.scheduledStart || new Date();
        const end = current.scheduledEnd || new Date();
        start.setFullYear(newDate.getFullYear(), newDate.getMonth(), newDate.getDate());
        end.setFullYear(newDate.getFullYear(), newDate.getMonth(), newDate.getDate());
        setCurrent(prev => ({ ...prev, scheduledStart: new Date(start), scheduledEnd: new Date(end) }));
    };

    const handlePanelChange = (userId: string) => {
        setCurrent(prev => {
            const panel = prev.panelUserIds || [];
            const newPanel = panel.includes(userId)
                ? panel.filter(id => id !== userId)
                : [...panel, userId];
            return { ...prev, panelUserIds: newPanel };
        });
    };
    
    const handleSave = () => {
        if (!current.applicationId || !current.scheduledStart || !current.scheduledEnd || !current.panelUserIds?.length) {
            alert("Please select an applicant, set a time, and add at least one interviewer.");
            return;
        }

        const payload: Partial<Interview> = { ...current };
        
        // Simulate Google Calendar/Meet integration
        if (payload.interviewType === InterviewType.Virtual) {
            payload.calendarEventId = `gcal-event-${Date.now()}`;
            payload.location = `https://meet.google.com/${Math.random().toString(36).substring(2, 5)}-${Math.random().toString(36).substring(2, 6)}-${Math.random().toString(36).substring(2, 5)}`;
        }

        onSave(payload as Interview);
    };

    const formatDateForInput = (date?: Date) => date ? new Date(date).toISOString().split('T')[0] : '';
    const formatTimeForInput = (date?: Date) => date ? new Date(date).toTimeString().substring(0,5) : '';

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={interview ? 'Edit Interview' : 'Schedule New Interview'}
            footer={
                <div className="flex justify-end w-full space-x-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>{interview ? 'Update Schedule' : 'Schedule Interview'}</Button>
                </div>
            }
        >
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium">Applicant</label>
                    <select name="applicationId" value={current.applicationId || ''} onChange={handleChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                        <option value="">-- Select an Applicant --</option>
                        {candidateOptions.map(opt => <option key={opt.appId} value={opt.appId}>{opt.label}</option>)}
                    </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Date" type="date" value={formatDateForInput(current.scheduledStart)} onChange={e => handleDateChange(e.target.value)} />
                    <div>
                        <label className="block text-sm font-medium">Type</label>
                        <select name="interviewType" value={current.interviewType || InterviewType.Virtual} onChange={handleChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            {Object.values(InterviewType).map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Start Time" type="time" value={formatTimeForInput(current.scheduledStart)} onChange={e => handleDateTimeChange('scheduledStart', e.target.value)} />
                    <Input label="End Time" type="time" value={formatTimeForInput(current.scheduledEnd)} onChange={e => handleDateTimeChange('scheduledEnd', e.target.value)} />
                </div>
                
                 {/* FIX: Use InterviewType enum for comparison to fix type error. */}
                 {current.interviewType === InterviewType.Onsite && (
                    <Input label="Location" name="location" value={current.location || ''} onChange={handleChange} placeholder="e.g. Main Office, Room 2"/>
                )}

                <div>
                    <label className="block text-sm font-medium">Interview Panel</label>
                    <div className="mt-2">
                         <Input 
                            label=""
                            id="panel-search"
                            placeholder="Search interviewers..."
                            value={panelSearchTerm}
                            onChange={e => setPanelSearchTerm(e.target.value)}
                            className="mb-2"
                        />
                    </div>
                    <div className="p-2 border rounded-md max-h-40 overflow-y-auto space-y-1">
                        {displayedInterviewers.map(interviewer => (
                            <div key={interviewer.id} className="flex items-center">
                                <input type="checkbox" id={`panel-${interviewer.id}`} checked={current.panelUserIds?.includes(interviewer.id)} onChange={() => handlePanelChange(interviewer.id)} className="h-4 w-4 text-indigo-600 rounded" />
                                <label htmlFor={`panel-${interviewer.id}`} className="ml-2">{interviewer.name} ({interviewer.role})</label>
                            </div>
                        ))}
                    </div>
                </div>
                 {current.interviewType === 'Virtual' && (
                    <div className="flex items-center">
                        <input type="checkbox" id="gcal" checked={true} readOnly className="h-4 w-4 text-indigo-600 rounded"/>
                        <label htmlFor="gcal" className="ml-2 text-sm">Create Google Calendar event and generate Meet link</label>
                    </div>
                 )}
            </div>
        </Modal>
    );
};

export default InterviewSchedulerModal;
