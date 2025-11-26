import React, { useState, useEffect, useMemo } from 'react';
import { User, ShiftTemplate, ShiftAssignment } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { mockBusinessUnits } from '../../services/mockData';

interface ShiftAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: User[];
  templates: ShiftTemplate[];
  assignments: ShiftAssignment[];
  onSave: (newAssignments: Omit<ShiftAssignment, 'id'>[]) => void;
  preselectedTemplateId?: string;
}

const ShiftAssignmentModal: React.FC<ShiftAssignmentModalProps> = ({ isOpen, onClose, employees, templates, assignments, onSave, preselectedTemplateId }) => {
    const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>(preselectedTemplateId || templates[0]?.id || '');
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [locationId, setLocationId] = useState('OFFICE-MAIN');
    const [buFilterId, setBuFilterId] = useState<string>('');
    const [error, setError] = useState('');

    const filteredEmployees = useMemo(() => {
        if (!buFilterId) {
            return employees;
        }
        const buName = mockBusinessUnits.find(bu => bu.id === buFilterId)?.name;
        return employees.filter(e => e.businessUnit === buName);
    }, [employees, buFilterId]);

    useEffect(() => {
        if (isOpen) {
            setSelectedTemplateId(preselectedTemplateId || templates[0]?.id || '');
            setSelectedEmployeeIds([]);
            setStartDate(new Date().toISOString().split('T')[0]);
            setEndDate(new Date().toISOString().split('T')[0]);
            setBuFilterId('');
            setError('');
        }
    }, [isOpen, preselectedTemplateId, templates]);

    const handleEmployeeSelection = (employeeId: string) => {
        setSelectedEmployeeIds(prev =>
            prev.includes(employeeId)
                ? prev.filter(id => id !== employeeId)
                : [...prev, employeeId]
        );
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedEmployeeIds(filteredEmployees.map(e => e.id));
        } else {
            setSelectedEmployeeIds([]);
        }
    }

    const handleSave = () => {
        setError('');
        if (selectedEmployeeIds.length === 0 || !selectedTemplateId || !startDate || !endDate) {
            setError('Please select employees, a template, and a valid date range.');
            return;
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        const newAssignments: Omit<ShiftAssignment, 'id'>[] = [];
        let conflict = false;

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            for (const employeeId of selectedEmployeeIds) {
                const existingAssignment = assignments.find(a =>
                    a.employeeId === employeeId &&
                    new Date(a.date).toDateString() === new Date(d).toDateString()
                );
                if (existingAssignment) {
                    const employee = employees.find(e => e.id === employeeId);
                    setError(`Conflict: ${employee?.name || 'Employee'} already has a shift on ${d.toLocaleDateString()}.`);
                    conflict = true;
                    break;
                }
                newAssignments.push({
                    employeeId,
                    shiftTemplateId: selectedTemplateId,
                    date: new Date(d),
                    locationId
                });
            }
            if (conflict) break;
        }

        if (!conflict) {
            onSave(newAssignments);
            onClose();
        }
    };
    
    if (!isOpen) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Assign Shifts"
            footer={
                <div className="flex justify-end w-full space-x-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>Assign Shifts</Button>
                </div>
            }
        >
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Select Employees</label>
                    <div className="my-2">
                        <label htmlFor="bu-filter-modal" className="sr-only">Filter by Business Unit</label>
                        <select
                            id="bu-filter-modal"
                            value={buFilterId}
                            onChange={e => setBuFilterId(e.target.value)}
                            className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                        >
                            <option value="">Filter by Business Unit...</option>
                            {mockBusinessUnits.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                        </select>
                    </div>
                    <div className="mt-2 p-2 border border-gray-300 dark:border-gray-600 rounded-md max-h-40 overflow-y-auto">
                        <div className="flex items-center border-b dark:border-gray-600 pb-2 mb-2">
                            <input
                                type="checkbox"
                                id="select-all"
                                checked={filteredEmployees.length > 0 && selectedEmployeeIds.length === filteredEmployees.length}
                                onChange={handleSelectAll}
                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                            />
                            <label htmlFor="select-all" className="ml-2 block text-sm font-semibold text-gray-900 dark:text-gray-200">Select All (Filtered)</label>
                        </div>
                        {filteredEmployees.map(emp => (
                            <div key={emp.id} className="flex items-center py-1">
                                <input
                                    type="checkbox"
                                    id={`emp-${emp.id}`}
                                    checked={selectedEmployeeIds.includes(emp.id)}
                                    onChange={() => handleEmployeeSelection(emp.id)}
                                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                />
                                <label htmlFor={`emp-${emp.id}`} className="ml-2 block text-sm text-gray-900 dark:text-gray-200">{emp.name}</label>
                            </div>
                        ))}
                    </div>
                </div>

                <div>
                    <label htmlFor="template" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Shift Template</label>
                    <select id="template" value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)} 
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:bg-gray-200 dark:disabled:bg-gray-800"
                        disabled={!!preselectedTemplateId}
                    >
                        {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.startTime}-{t.endTime})</option>)}
                    </select>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                    <Input label="Start Date" type="date" id="start-date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    <Input label="End Date" type="date" id="end-date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>

                <Input label="Location ID" type="text" id="location" value={locationId} onChange={e => setLocationId(e.target.value)} />

                {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
        </Modal>
    );
};

export default ShiftAssignmentModal;
