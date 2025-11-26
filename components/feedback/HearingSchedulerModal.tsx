import React, { useState, useEffect, useMemo } from 'react';
import { HearingDetails, User } from '../../types';
import { mockUsers } from '../../services/mockData';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import EmployeeMultiSelect from '../feedback/EmployeeMultiSelect';

interface HearingSchedulerModalProps {
    isOpen: boolean;
    onClose: () => void;
    hearingDetails: HearingDetails | undefined;
    onSave: (hearingDetails: HearingDetails) => void;
}

const HearingSchedulerModal: React.FC<HearingSchedulerModalProps> = ({ isOpen, onClose, hearingDetails, onSave }) => {
    const [current, setCurrent] = useState<Partial<HearingDetails>>(hearingDetails || {});
    const [selectedPanel, setSelectedPanel] = useState<User[]>([]);

    // Filter out employees (only show management/HR) for panel
    const potentialPanelists = useMemo(() => {
        return mockUsers.filter(u => u.role !== 'Employee');
    }, []);

    useEffect(() => {
        if (isOpen) {
            const now = new Date();
            now.setMinutes(0);
            now.setSeconds(0);
            now.setDate(now.getDate() + 3); // Default to 3 days from now

            setCurrent(hearingDetails || {
                date: now,
                type: 'Face-to-Face',
                location: '',
                panelIds: [],
                notes: '',
                acknowledgments: [] // Initialize empty if new
            });

            if (hearingDetails?.panelIds) {
                const panelists = mockUsers.filter(u => hearingDetails.panelIds.includes(u.id));
                setSelectedPanel(panelists);
            } else {
                setSelectedPanel([]);
            }
        }
    }, [hearingDetails, isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setCurrent(prev => ({ ...prev, [name]: value }));
    };

    const handleDateChange = (value: string) => {
        const newDate = new Date(value);
        const currentDateTime = current.date || new Date();
        currentDateTime.setFullYear(newDate.getFullYear(), newDate.getMonth(), newDate.getDate());
        setCurrent(prev => ({ ...prev, date: new Date(currentDateTime) }));
    };
    
    const handleTimeChange = (value: string) => {
        const [hours, minutes] = value.split(':').map(Number);
        const currentDateTime = current.date || new Date();
        currentDateTime.setHours(hours, minutes);
        setCurrent(prev => ({ ...prev, date: new Date(currentDateTime) }));
    };

    const handleSave = () => {
        if (!current.date || !current.type || !current.location || selectedPanel.length === 0) {
            alert("Please fill in all required fields (Date, Time, Type, Location, Panel).");
            return;
        }

        const payload: HearingDetails = {
            date: current.date,
            type: current.type as 'Virtual' | 'Face-to-Face',
            location: current.location,
            panelIds: selectedPanel.map(u => u.id),
            notes: current.notes,
            acknowledgments: current.acknowledgments || [] // Preserve existing acknowledgments
        };

        onSave(payload);
    };

    const formatDateForInput = (date?: Date) => date ? new Date(date).toISOString().split('T')[0] : '';
    const formatTimeForInput = (date?: Date) => date ? new Date(date).toTimeString().substring(0, 5) : '';

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={hearingDetails ? 'Edit Hearing Schedule' : 'Schedule Administrative Hearing'}
            footer={
                <div className="flex justify-end w-full space-x-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>{hearingDetails ? 'Update Hearing' : 'Schedule Hearing'}</Button>
                </div>
            }
        >
            <div className="space-y-4">
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-yellow-800 dark:bg-yellow-900/30 dark:border-yellow-700 dark:text-yellow-200">
                    <p><strong>Note:</strong> Scheduling a hearing is a formal step in due process. Ensure the employee is notified at least 48 hours in advance.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input 
                        label="Hearing Date" 
                        type="date" 
                        value={formatDateForInput(current.date)} 
                        onChange={e => handleDateChange(e.target.value)} 
                        required
                    />
                    <Input 
                        label="Time" 
                        type="time" 
                        value={formatTimeForInput(current.date)} 
                        onChange={e => handleTimeChange(e.target.value)} 
                        required
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Hearing Type</label>
                        <select 
                            name="type" 
                            value={current.type || 'Face-to-Face'} 
                            onChange={handleChange} 
                            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        >
                            <option value="Face-to-Face">Face-to-Face</option>
                            <option value="Virtual">Virtual (Online)</option>
                        </select>
                    </div>
                    <Input 
                        label={current.type === 'Virtual' ? "Meeting Link" : "Location / Room"}
                        name="location"
                        value={current.location || ''}
                        onChange={handleChange}
                        placeholder={current.type === 'Virtual' ? "https://meet.google.com/..." : "e.g. Conference Room A"}
                        required
                    />
                </div>
                
                <EmployeeMultiSelect
                    label="Hearing Panel (HR, Dept Head, etc.)"
                    allUsers={potentialPanelists}
                    selectedUsers={selectedPanel}
                    onSelectionChange={setSelectedPanel}
                />

                <Textarea 
                    label="Additional Notes / Instructions" 
                    name="notes" 
                    value={current.notes || ''} 
                    onChange={handleChange} 
                    rows={3} 
                    placeholder="e.g., Employee may bring legal counsel."
                />
            </div>
        </Modal>
    );
};

export default HearingSchedulerModal;