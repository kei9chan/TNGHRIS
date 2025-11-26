
import React, { useState, useEffect, useMemo } from 'react';
import { ManpowerRequest, ManpowerRequestStatus, ManpowerRequestItem, Role } from '../../types';
import { mockBusinessUnits, mockUsers, mockShiftAssignments } from '../../services/mockData';
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

    const accessibleBus = useMemo(() => getAccessibleBusinessUnits(mockBusinessUnits), [getAccessibleBusinessUnits]);
    const isPrivileged = user && [Role.Admin, Role.HRManager, Role.HRStaff].includes(user.role);

    useEffect(() => {
        if (isOpen && user) {
            setDate(new Date().toISOString().split('T')[0]);
            setForecastedPax(0);
            setGeneralNote('');
            setItems([{ id: `item-${Date.now()}`, role: '', currentFte: 0, requestedCount: 0, costPerHead: 0, totalItemCost: 0, shiftTime: '', justification: '' }]);
            
            // Default BU Selection based on scope
            // If user is privileged or has multiple BUs, default to the first one in the accessible list
            // If they have only one (e.g. BU Manager), use that one.
            if (accessibleBus.length > 0) {
                const userHomeBu = accessibleBus.find(b => b.name === user.businessUnit);
                setSelectedBuId(userHomeBu?.id || accessibleBus[0].id);
            } else {
                 setSelectedBuId('');
            }
        }
    }, [isOpen, user, isPrivileged, accessibleBus]);

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
        setItems([...items, { id: `item-${Date.now()}`, role: '', currentFte: 0, requestedCount: 0, costPerHead: 0, totalItemCost: 0, shiftTime: '', justification: '' }]);
    };

    const handleRemoveItem = (index: number) => {
        setItems(items.filter((_, i) => i !== index));
    };

    const handleDateChange = (newDate: string) => {
        setDate(newDate);
        // Recalculate FTE for all existing items based on new date
        const updatedItems = items.map(item => ({
            ...item,
            currentFte: calculateFteForRole(item.role, newDate)
        }));
        setItems(updatedItems);
    };

    const handleBuChange = (newBuId: string) => {
        setSelectedBuId(newBuId);
        // Recalculate FTE when BU changes as well
        const updatedItems = items.map(item => ({
            ...item,
            currentFte: calculateFteForRole(item.role, date)
        }));
        setItems(updatedItems);
    };

    const handleItemChange = (index: number, field: keyof ManpowerRequestItem, value: string | number) => {
        const newItems = [...items];
        (newItems[index] as any)[field] = value;

        // Logic to auto-calculate costs and FTE
        if (field === 'role') {
            const roleName = value as string;
            const rate = getEstimatedRate(roleName);
            const fte = calculateFteForRole(roleName, date);

            newItems[index].costPerHead = rate;
            newItems[index].currentFte = fte;
            newItems[index].totalItemCost = rate * newItems[index].requestedCount;
        }
        
        if (field === 'requestedCount' || field === 'costPerHead') {
            const count = field === 'requestedCount' ? (value as number) : newItems[index].requestedCount;
            const rate = field === 'costPerHead' ? (value as number) : newItems[index].costPerHead;
            newItems[index].totalItemCost = count * rate;
        }

        setItems(newItems);
    };

    const handleSubmit = () => {
        if (!user) return;
        
        const validItems = items.filter(i => i.role && i.requestedCount > 0);
        if (validItems.length === 0) {
            alert("Please add at least one valid request item (Role and Count required).");
            return;
        }

        const bu = mockBusinessUnits.find(b => b.id === selectedBuId);
        const grandTotal = validItems.reduce((sum, item) => sum + item.totalItemCost, 0);

        const newRequest: ManpowerRequest = {
            id: `MPR-${Date.now()}`,
            businessUnitId: bu?.id || 'unknown',
            businessUnitName: bu?.name || 'Unknown BU',
            requestedBy: user.id,
            requesterName: user.name,
            date: new Date(date),
            forecastedPax,
            generalNote,
            items: validItems,
            grandTotal,
            status: ManpowerRequestStatus.Pending,
            createdAt: new Date()
        };

        onSave(newRequest);
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
                    <Button onClick={handleSubmit}>Submit Request</Button>
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
