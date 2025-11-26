
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { User, LeaveLedgerEntryType } from '../../types';
import { mockUsers, mockLeaveTypes } from '../../services/mockData';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';

interface ManualLeaveEntryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: {
        employeeId: string;
        leaveTypeId: string;
        type: LeaveLedgerEntryType;
        change: number;
        date: Date;
        notes: string;
    }) => void;
}

const SearchIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;

const ManualLeaveEntryModal: React.FC<ManualLeaveEntryModalProps> = ({ isOpen, onClose, onSave }) => {
    const [employeeId, setEmployeeId] = useState('');
    const [leaveTypeId, setLeaveTypeId] = useState(mockLeaveTypes[0]?.id || '');
    const [entryMode, setEntryMode] = useState<'usage' | 'accrual' | 'adjustment'>('usage');
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [notes, setNotes] = useState('');

    // Search State
    const [searchTerm, setSearchTerm] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const activeEmployees = useMemo(() => mockUsers.filter(u => u.status === 'Active').sort((a,b) => a.name.localeCompare(b.name)), []);

    const filteredEmployees = useMemo(() => {
        if (!searchTerm) return activeEmployees;
        return activeEmployees.filter(u => u.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [activeEmployees, searchTerm]);

    // Reset form when opening
    useEffect(() => {
        if (isOpen) {
            setEmployeeId('');
            setSearchTerm('');
            setLeaveTypeId(mockLeaveTypes[0]?.id || '');
            setEntryMode('usage');
            setAmount('');
            setDate(new Date().toISOString().split('T')[0]);
            setNotes('');
        }
    }, [isOpen]);

    // Click outside to close dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelectEmployee = (user: User) => {
        setEmployeeId(user.id);
        setSearchTerm(user.name);
        setIsDropdownOpen(false);
    };

    const handleSubmit = () => {
        if (!employeeId || !leaveTypeId || !amount || !date || !notes) {
            alert('Please fill in all required fields.');
            return;
        }

        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            alert('Please enter a valid positive number for the amount.');
            return;
        }

        let finalChange = numAmount;
        let type = LeaveLedgerEntryType.Adjustment;

        if (entryMode === 'usage') {
            finalChange = -Math.abs(numAmount); // Ensure it's negative
            type = LeaveLedgerEntryType.Usage;
        } else if (entryMode === 'accrual') {
            finalChange = Math.abs(numAmount); // Ensure it's positive
            type = LeaveLedgerEntryType.Accrual;
        }
        
        onSave({
            employeeId,
            leaveTypeId,
            type,
            change: finalChange,
            date: new Date(date),
            notes
        });
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Manual Leave Adjustment"
            size="lg"
            footer={
                <div className="flex justify-end space-x-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSubmit}>Apply Adjustment</Button>
                </div>
            }
        >
            <div className="space-y-4">
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm text-yellow-800 dark:bg-yellow-900/30 dark:border-yellow-800 dark:text-yellow-200">
                    <p><strong>Note:</strong> This action bypasses the approval workflow. Use for corrections, data migration, or manual accruals.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Searchable Employee Input */}
                    <div className="relative" ref={dropdownRef}>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Employee</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <SearchIcon />
                            </div>
                            <input
                                type="text"
                                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                placeholder="Search employee..."
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setIsDropdownOpen(true);
                                    if (e.target.value === '') setEmployeeId('');
                                }}
                                onFocus={() => setIsDropdownOpen(true)}
                            />
                        </div>
                        {isDropdownOpen && (
                            <div className="absolute z-20 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-md shadow-lg max-h-48 overflow-y-auto custom-scrollbar">
                                {filteredEmployees.length > 0 ? (
                                    filteredEmployees.map(u => (
                                        <div
                                            key={u.id}
                                            className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer text-sm text-gray-900 dark:text-white flex justify-between"
                                            onClick={() => handleSelectEmployee(u)}
                                        >
                                            <span>{u.name}</span>
                                            <span className="text-gray-500 text-xs">{u.department}</span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="px-4 py-2 text-sm text-gray-500">No employees found</div>
                                )}
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Leave Type</label>
                        <select
                            value={leaveTypeId}
                            onChange={(e) => setLeaveTypeId(e.target.value)}
                            className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                        >
                            {mockLeaveTypes.map(lt => (
                                <option key={lt.id} value={lt.id}>{lt.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="p-4 border rounded-md bg-gray-50 dark:bg-slate-800/50 dark:border-slate-700">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Transaction Type</label>
                    <div className="flex space-x-6">
                        <label className="flex items-center cursor-pointer">
                            <input 
                                type="radio" 
                                name="entryMode" 
                                value="usage" 
                                checked={entryMode === 'usage'} 
                                onChange={() => setEntryMode('usage')}
                                className="h-4 w-4 text-red-600 border-gray-300 focus:ring-red-500"
                            />
                            <span className="ml-2 text-sm text-gray-900 dark:text-gray-300">Record Usage (Deduct)</span>
                        </label>
                        <label className="flex items-center cursor-pointer">
                            <input 
                                type="radio" 
                                name="entryMode" 
                                value="accrual" 
                                checked={entryMode === 'accrual'} 
                                onChange={() => setEntryMode('accrual')}
                                className="h-4 w-4 text-green-600 border-gray-300 focus:ring-green-500"
                            />
                            <span className="ml-2 text-sm text-gray-900 dark:text-gray-300">Add Balance / Accrual</span>
                        </label>
                         <label className="flex items-center cursor-pointer">
                            <input 
                                type="radio" 
                                name="entryMode" 
                                value="adjustment" 
                                checked={entryMode === 'adjustment'} 
                                onChange={() => setEntryMode('adjustment')}
                                className="h-4 w-4 text-yellow-600 border-gray-300 focus:ring-yellow-500"
                            />
                            <span className="ml-2 text-sm text-gray-900 dark:text-gray-300">Correction (Signed Value)</span>
                        </label>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <Input 
                        label="Amount (Days)" 
                        type="number" 
                        step="0.5" 
                        value={amount} 
                        onChange={e => setAmount(e.target.value)} 
                        placeholder="e.g. 1.0"
                        required
                    />
                    <Input 
                        label="Effective Date" 
                        type="date" 
                        value={date} 
                        onChange={e => setDate(e.target.value)} 
                        required
                    />
                </div>

                <Textarea 
                    label="Remarks / Justification" 
                    value={notes} 
                    onChange={e => setNotes(e.target.value)} 
                    placeholder="e.g. Migrated from 2024 records, or Manual correction for system error"
                    rows={2}
                    required
                />

            </div>
        </Modal>
    );
};

export default ManualLeaveEntryModal;
