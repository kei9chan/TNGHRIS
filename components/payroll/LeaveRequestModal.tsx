
import React, { useState, useEffect, useMemo } from 'react';
// FIX: Added 'Permission' and 'Role' to import.
import { LeaveRequest, LeaveRequestStatus, LeaveBalance, Permission, Role } from '../../types';
import { mockLeaveTypes, mockUsers } from '../../services/mockData';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import FileUploader from '../ui/FileUploader';

interface LeaveRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: LeaveRequest | null;
  balances: (LeaveBalance & { available: number; name: string })[];
  onSave: (request: Partial<LeaveRequest>, status: LeaveRequestStatus) => void;
  onApprove: (request: LeaveRequest, approved: boolean, notes: string) => void;
}

const LeaveRequestModal: React.FC<LeaveRequestModalProps> = ({ isOpen, onClose, request, balances, onSave, onApprove }) => {
    const { user } = useAuth();
    const { can, hasDirectReports } = usePermissions();
    const [current, setCurrent] = useState<Partial<LeaveRequest>>(request || {});
    const [managerNotes, setManagerNotes] = useState('');

    const isNewRequest = !request;
    const isManagerView = request && request.employeeId !== user?.id && request.status === LeaveRequestStatus.Pending;
    const canEdit = isNewRequest || request?.status === LeaveRequestStatus.Draft;
    
    // Check permission or relationship
    const canApprove = can('Leave', Permission.Approve) || hasDirectReports();

    const isBOD = user?.role === Role.BOD;
    const manager = useMemo(() => mockUsers.find(u => u.id === user?.managerId), [user]);

    useEffect(() => {
        if (isOpen) {
            setCurrent(request || {
                leaveTypeId: mockLeaveTypes[0]?.id || '',
                startDate: new Date(),
                endDate: new Date(),
                status: LeaveRequestStatus.Draft
            });
            setManagerNotes('');
        }
    }, [request, isOpen]);
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setCurrent(prev => ({...prev, [name]: value}));
    };

    const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
        const newDate = new Date(value);
        if (field === 'startDate' && newDate > (current.endDate || new Date())) {
            setCurrent(prev => ({ ...prev, startDate: newDate, endDate: newDate }));
        } else {
            setCurrent(prev => ({ ...prev, [field]: newDate }));
        }
    };
    
    const footer = () => {
        if (isManagerView && canApprove) {
            return (
                <div className="flex w-full justify-between items-center">
                    <Textarea label="Manager Notes (Required for Rejection)" value={managerNotes} onChange={e => setManagerNotes(e.target.value)} rows={1} />
                    <div className="flex space-x-2 ml-4">
                        <Button variant="danger" onClick={() => onApprove(request!, false, managerNotes)} disabled={!managerNotes}>Reject</Button>
                        <Button onClick={() => onApprove(request!, true, managerNotes)}>Approve</Button>
                    </div>
                </div>
            );
        }
        if (canEdit) {
            const isSubmittable = isBOD || !!manager;
            return (
                <div className="flex w-full justify-end space-x-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => onSave(current, LeaveRequestStatus.Draft)}>Save Draft</Button>
                    <Button 
                        onClick={() => onSave(current, LeaveRequestStatus.Pending)} 
                        variant="primary"
                        disabled={!isSubmittable}
                        title={!isSubmittable ? "Cannot submit: No manager assigned." : ""}
                    >
                        Submit
                    </Button>
                </div>
            )
        }
        return <div className="flex w-full justify-end"><Button variant="secondary" onClick={onClose}>Close</Button></div>;
    };
    
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isNewRequest ? 'Request Leave' : 'Leave Request Details'}
            footer={footer()}
        >
            <div className="space-y-4">
                 {request && (
                    <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-md">
                        <p><span className="font-semibold">Employee:</span> {request.employeeName}</p>
                    </div>
                 )}
                 
                 {/* Approver Display Logic */}
                 {isNewRequest && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md mb-4">
                        {isBOD ? (
                            <p className="text-sm text-blue-800 dark:text-blue-200 font-medium">
                                Note: As a Board Member, your leave request will be automatically approved upon submission.
                            </p>
                        ) : manager ? (
                            <p className="text-sm text-blue-800 dark:text-blue-200">
                                <span className="font-bold">Approver:</span> {manager.name} ({manager.position})
                            </p>
                        ) : (
                            <p className="text-sm text-red-600 dark:text-red-400 font-bold">
                                Warning: You do not have a reporting manager assigned. Please contact HR before submitting.
                            </p>
                        )}
                    </div>
                 )}

                <div>
                    <label className="block text-sm font-medium">Leave Type</label>
                    <select name="leaveTypeId" value={current.leaveTypeId || ''} onChange={handleChange} disabled={!canEdit} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:bg-gray-200 dark:disabled:bg-gray-800">
                        {balances.map(b => <option key={b.leaveTypeId} value={b.leaveTypeId}>{b.name} ({b.available} days left)</option>)}
                    </select>
                </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Start Date" type="date" value={current.startDate ? new Date(current.startDate).toISOString().split('T')[0] : ''} onChange={e => handleDateChange('startDate', e.target.value)} disabled={!canEdit} />
                    <Input label="End Date" type="date" value={current.endDate ? new Date(current.endDate).toISOString().split('T')[0] : ''} onChange={e => handleDateChange('endDate', e.target.value)} disabled={!canEdit} />
                </div>
                <Textarea label="Reason" name="reason" value={current.reason || ''} onChange={handleChange} rows={3} required disabled={!canEdit} />
                
                {!isManagerView && 
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Attach Document (Optional)</label>
                        <FileUploader onFileUpload={() => {}} />
                    </div>
                }
            </div>
        </Modal>
    );
};

export default LeaveRequestModal;
