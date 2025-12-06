
import React, { useState, useEffect, useMemo } from 'react';
import { ManpowerRequest, ManpowerRequestStatus, ManpowerRequestItem, Role } from '../../types';
import { mockUsers, mockShiftAssignments, mockBusinessUnits } from '../../services/mockData';
import { supabase } from '../../services/supabaseClient';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';

interface ManpowerRequestModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (request: ManpowerRequest) => void;
}

const TrashIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;
const PlusIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>;

const ManpowerRequestModal: React.FC<ManpowerRequestModalProps> = ({ isOpen, onClose, onSave }) => {
    const { user } = useAuth();
    const { getAccessibleBusinessUnits } = usePermissions();
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [forecastedPax, setForecastedPax] = useState<number>(0);
    const [generalNote, setGeneralNote] = useState('');
    const [items, setItems] = useState<ManpowerRequestItem[]>([]);
    const [selectedBuId, setSelectedBuId] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [businessUnits, setBusinessUnits] = useState<{ id: string; name: string }[]>([]);

    // For now expose all business units; if you want to reintroduce scoping, reapply getAccessibleBusinessUnits here.
    const accessibleBus = businessUnits;

    useEffect(() => {
        const loadBus = async () => {
            const { data, error } = await supabase.from('business_units').select('id, name').order('name');
            if (!error && data) {
                setBusinessUnits(data.map(d => ({ id: d.id, name: d.name })));
            } else {
                setBusinessUnits([]);
            }
        };
        loadBus();
    }, []);
    const isPrivileged = user && [Role.Admin, Role.HRManager, Role.HRStaff].includes(user.role);

    useEffect(() => {
        if (!isOpen || !user) return;
        setDate(new Date().toISOString().split('T')[0]);
        setForecastedPax(0);
        setGeneralNote('');
        setItems([{ id: `item-${Date.now()}`, role: '', currentFte: 0, requestedCount: 0, costPerHead: 0, totalItemCost: 0, shiftTime: '', justification: '' }]);
        
        if (accessibleBus.length > 0) {
            const userHomeBu = accessibleBus.find(b => b.name === user.businessUnit);
            setSelectedBuId(userHomeBu?.id || accessibleBus[0].id);
        } else {
            setSelectedBuId('');
        }
    }, [isOpen, user]); 

    // Function to estimate daily rate based on role name from existing employees
    const getEstimatedRate = (roleName: string) => {
        if (!roleName) return 0;
        // Find first user with this position
        const match = mockUsers.find(u => u.position.toLowerCase().includes(roleName.toLowerCase()) || roleName.toLowerCase().includes(u.position.toLowerCase()));
        
        if (match && match.rateAmount) {
             // If Monthly, divide by 22 days approx. If Daily, take as is.
             return match.rateType === 'Monthly' ? Math.round(match.rateAmount / 22) : match.rateAmount;
        }
        // Fallback default minimum daily wage if no match found
        return 610; 
    };

    // Function to calculate Reporting FTE from Schedule
    const calculateFteForRole = (roleName: string, dateStr: string) => {
        if (!roleName || !dateStr || !selectedBuId) return 0;
        
        const targetDate = new Date(dateStr).toDateString();
        const selectedBuName = mockBusinessUnits.find(b => b.id === selectedBuId)?.name;

        // 1. Get all assignments for this date
        const assignmentsOnDate = mockShiftAssignments.filter(a => 
            new Date(a.date).toDateString() === targetDate
        );

        // 2. Count how many of these assignments belong to employees with the given role AND Business Unit
        const count = assignmentsOnDate.reduce((acc, assignment) => {
            const employee = mockUsers.find(u => u.id === assignment.employeeId);
            
            if (employee && employee.businessUnit === selectedBuName && employee.position && employee.position.toLowerCase().includes(roleName.toLowerCase())) {
                return acc + 1;
            }
            return acc;
        }, 0);

        return count;
    };

    const handleAddItem = () => {
        setItems(prev => [
            ...prev,
            { id: `item-${Date.now()}`, role: '', currentFte: 0, requestedCount: 0, costPerHead: 0, totalItemCost: 0, shiftTime: '', justification: '' },
        ]);
    };

    const handleRemoveItem = (index: number) => {
        setItems(prev => prev.filter((_, i) => i !== index));
    };

    const handleDateChange = (newDate: string) => {
        setDate(newDate);
    };

    const handleBuChange = (newBuId: string) => {
        setSelectedBuId(newBuId);
    };

    const handleItemChange = (index: number, field: keyof ManpowerRequestItem, value: string | number) => {
        setItems(prev => {
            const next = [...prev];
            const current = { ...next[index], [field]: value };

            if (field === 'requestedCount' || field === 'costPerHead') {
                const count = field === 'requestedCount' ? (value as number) : current.requestedCount;
                const rate = field === 'costPerHead' ? (value as number) : current.costPerHead;
                current.totalItemCost = count * rate;
            }

            next[index] = current;
            return next;
        });
    };

    const handleSubmit = async () => {
        if (!user) {
            alert('You must be signed in to submit a request.');
            return;
        }
        setIsSubmitting(true);

        // All rows must have a role; keep all rows (including count 0) to avoid dropping items.
        if (items.some(i => !i.role)) {
            alert('Please fill in a role/area for each row or remove empty rows.');
            setIsSubmitting(false);
            return;
        }

        const bu = businessUnits.find(b => b.id === selectedBuId);
        const grandTotal = items.reduce((sum, item) => sum + (Number(item.totalItemCost) || 0), 0);

        const payload = {
            business_unit_id: selectedBuId || null,
            business_unit_name: bu?.name || user.businessUnit || null,
            department_id: user.departmentId || null,
            requester_id: user.id,
            requester_name: user.name,
            date_needed: date,
            forecasted_pax: forecastedPax,
            general_note: generalNote,
            justification: generalNote,
            items,
            grand_total: grandTotal,
            status: ManpowerRequestStatus.Pending,
        };

        const { data, error } = await supabase.from('manpower_requests').insert(payload).select().single();
        if (error) {
            alert('Failed to submit request. Please try again.');
            setIsSubmitting(false);
            return;
        }

        const newRequest: ManpowerRequest = {
            id: data.id,
            businessUnitId: data.business_unit_id || selectedBuId || '',
            businessUnitName: data.business_unit_name || bu?.name || user.businessUnit || 'Unknown BU',
            requestedBy: data.requester_id || user.id,
            requesterName: data.requester_name || user.name,
            date: data.date_needed ? new Date(data.date_needed) : new Date(date),
            forecastedPax: data.forecasted_pax || forecastedPax,
            generalNote: data.general_note || generalNote,
            items: (data.items as ManpowerRequestItem[]) || items,
            grandTotal: data.grand_total || grandTotal,
            status: (data.status as ManpowerRequestStatus) || ManpowerRequestStatus.Pending,
            createdAt: data.created_at ? new Date(data.created_at) : new Date(),
            approvedBy: data.approved_by || undefined,
            approvedAt: data.approved_at ? new Date(data.approved_at) : undefined,
            rejectionReason: data.rejection_reason || undefined,
        };

        onSave(newRequest);
        setIsSubmitting(false);
        onClose();
    };

    const totalRequestedCount = items.reduce((sum, item) => sum + (Number(item.requestedCount) || 0), 0);
    const totalRequestedCost = items.reduce((sum, item) => sum + (Number(item.totalItemCost) || 0), 0);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Create On-Call Manpower Request"
            size="4xl"
            footer={
                <div className="flex justify-end w-full space-x-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting ? 'Submitting...' : 'Submit Request'}
                    </Button>
                </div>
            }
        >
            <div className="space-y-6">
                {/* Header Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border dark:border-gray-700">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Unit</label>
                         <select 
                            value={selectedBuId} 
                            onChange={(e) => handleBuChange(e.target.value)} 
                            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        >
                            {accessibleBus.map(bu => (
                                <option key={bu.id} value={bu.id}>{bu.name}</option>
                            ))}
                        </select>
                    </div>
                     <Input 
                        label="Date Needed" 
                        type="date" 
                        value={date} 
                        onChange={e => handleDateChange(e.target.value)} 
                        required
                    />
                    <Input 
                        label="Forecasted PAX" 
                        type="number" 
                        value={forecastedPax} 
                        onChange={e => setForecastedPax(parseInt(e.target.value) || 0)} 
                        required
                    />
                    <Input 
                        label="Event Context / Header Note (Optional)" 
                        value={generalNote} 
                        onChange={e => setGeneralNote(e.target.value)} 
                        placeholder="e.g. Halloween Event, Big Group Booking"
                    />
                </div>

                {/* Dynamic Table */}
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Staffing Breakdown</h3>
                        <Button size="sm" variant="secondary" onClick={handleAddItem}>
                            <PlusIcon /> Add Row
                        </Button>
                    </div>
                    <div className="overflow-x-auto border rounded-lg dark:border-gray-700">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-100 dark:bg-gray-900">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/5">Role/Area</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24" title="Reporting Full-Time Equivalent (Scheduled Staff)">Sched. Count</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Req. On-Call</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">Rate/Day</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">Total Cost</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-40">Shift Time</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Justification</th>
                                    <th className="px-4 py-3 w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {items.map((item, index) => (
                                    <tr key={item.id}>
                                        <td className="px-4 py-2">
                                            <input 
                                                type="text" 
                                                className="w-full p-1 border rounded dark:bg-gray-700 dark:border-gray-600 text-sm"
                                                placeholder="e.g. CRA"
                                                value={item.role}
                                                onChange={e => handleItemChange(index, 'role', e.target.value)}
                                            />
                                        </td>
                                        <td className="px-4 py-2">
                                            <input 
                                                type="number" 
                                                className="w-full p-1 border rounded dark:bg-gray-700 dark:border-gray-600 text-sm bg-gray-100 dark:bg-gray-800 text-center"
                                                min="0"
                                                readOnly
                                                title="Auto-calculated from Schedule"
                                                value={item.currentFte}
                                                onChange={e => handleItemChange(index, 'currentFte', parseInt(e.target.value) || 0)}
                                            />
                                        </td>
                                        <td className="px-4 py-2">
                                             <input 
                                                type="number" 
                                                className="w-full p-1 border rounded dark:bg-gray-700 dark:border-gray-600 text-sm font-bold text-blue-600 text-center"
                                                min="0"
                                                value={item.requestedCount}
                                                onChange={e => handleItemChange(index, 'requestedCount', parseInt(e.target.value) || 0)}
                                            />
                                        </td>
                                         <td className="px-4 py-2">
                                            <input 
                                                type="number" 
                                                className="w-full p-1 border rounded dark:bg-gray-700 dark:border-gray-600 text-sm text-right"
                                                min="0"
                                                value={item.costPerHead}
                                                onChange={e => handleItemChange(index, 'costPerHead', parseFloat(e.target.value) || 0)}
                                            />
                                        </td>
                                        <td className="px-4 py-2">
                                            <div className="text-sm font-bold text-gray-700 dark:text-gray-300 text-right">
                                                {item.totalItemCost.toLocaleString()}
                                            </div>
                                        </td>
                                        <td className="px-4 py-2">
                                            <input 
                                                type="text" 
                                                className="w-full p-1 border rounded dark:bg-gray-700 dark:border-gray-600 text-sm"
                                                placeholder="8am-5pm"
                                                value={item.shiftTime}
                                                onChange={e => handleItemChange(index, 'shiftTime', e.target.value)}
                                            />
                                        </td>
                                        <td className="px-4 py-2">
                                            <input 
                                                type="text" 
                                                className="w-full p-1 border rounded dark:bg-gray-700 dark:border-gray-600 text-sm"
                                                placeholder="Reason..."
                                                value={item.justification}
                                                onChange={e => handleItemChange(index, 'justification', e.target.value)}
                                            />
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                            <button onClick={() => handleRemoveItem(index)} className="text-red-500 hover:text-red-700">
                                                <TrashIcon />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-gray-50 dark:bg-gray-900 font-semibold">
                                <tr>
                                    <td colSpan={2} className="px-4 py-3 text-right text-sm">Total Requested:</td>
                                    <td className="px-4 py-3 text-center text-sm text-blue-600">{totalRequestedCount}</td>
                                    <td></td>
                                    <td className="px-4 py-3 text-right text-sm text-green-600">{totalRequestedCost.toLocaleString()}</td>
                                    <td colSpan={3}></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">* 'Sched. Count' is automatically populated based on published shifts for the selected date. Rates are estimated.</p>
                </div>
            </div>
        </Modal>
    );
};

export default ManpowerRequestModal;
