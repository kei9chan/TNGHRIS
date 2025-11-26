
import React, { useState, useEffect, useMemo } from 'react';
import { OTRequest, OTStatus, Role, AttendanceRecord, AttendanceException, Permission, ShiftAssignment, ShiftTemplate } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import FileUploader from '../ui/FileUploader';

interface OTRequestModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (request: Partial<OTRequest>, status: OTStatus) => void;
    onApproveOrReject: (request: Partial<OTRequest>, newStatus: OTStatus.Approved | OTStatus.Rejected, details: { approvedHours?: number, managerNote?: string }) => void;
    requestToEdit: OTRequest | null;
    attendanceRecords: AttendanceRecord[];
    shiftAssignments?: ShiftAssignment[];
    shiftTemplates?: ShiftTemplate[];
}

const calculatePlannedHours = (start: string, end: string): number => {
    if (!start || !end) return 0;
    const startTime = new Date(`1970-01-01T${start}:00`);
    const endTime = new Date(`1970-01-01T${end}:00`);
    
    // Handle overnight shifts where end time is smaller than start time
    if (endTime < startTime) {
        endTime.setDate(endTime.getDate() + 1);
    }
    
    const diffMs = endTime.getTime() - startTime.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    return Math.round(diffHours * 4) / 4; // Round to nearest quarter hour
};

const isTimeOverlap = (start1: string, end1: string, start2: string, end2: string): boolean => {
    if (!start1 || !end1 || !start2 || !end2) return false;
    
    const toMinutes = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    };
    
    const s1 = toMinutes(start1);
    let e1 = toMinutes(end1);
    const s2 = toMinutes(start2);
    let e2 = toMinutes(end2);
    
    if (e1 < s1) e1 += 24 * 60; // Overnight fix
    if (e2 < s2) e2 += 24 * 60; // Overnight fix

    return Math.max(s1, s2) < Math.min(e1, e2);
};


const OTRequestModal: React.FC<OTRequestModalProps> = ({ isOpen, onClose, onSave, onApproveOrReject, requestToEdit, attendanceRecords, shiftAssignments = [], shiftTemplates = [] }) => {
    const { user } = useAuth();
    const { can } = usePermissions();
    const [request, setRequest] = useState<Partial<OTRequest>>({});
    const [approvedHours, setApprovedHours] = useState('');
    const [managerNote, setManagerNote] = useState('');
    const [error, setError] = useState('');
    const [warnings, setWarnings] = useState<string[]>([]);
    const [shiftInfo, setShiftInfo] = useState<string>('');

    useEffect(() => {
        if (isOpen) {
            const initialRequest = requestToEdit || {
                employeeId: user?.id,
                employeeName: user?.name,
                date: new Date(),
                startTime: '', // Will be populated dynamically
                endTime: '',
                reason: '',
                status: OTStatus.Draft,
                historyLog: [],
            };
            setRequest(initialRequest);
            setApprovedHours(requestToEdit?.approvedHours?.toString() || '');
            setManagerNote(requestToEdit?.managerNote || '');
            setError('');
            setWarnings([]);
            setShiftInfo('');
            
            // If creating new, try to auto-populate start time from shift
            if (!requestToEdit && initialRequest.date && initialRequest.employeeId) {
                 const dateStr = new Date(initialRequest.date).toDateString();
                 const assignment = shiftAssignments.find(s => 
                     s.employeeId === initialRequest.employeeId && 
                     new Date(s.date).toDateString() === dateStr
                 );
                 
                 if (assignment) {
                     const template = shiftTemplates.find(t => t.id === assignment.shiftTemplateId);
                     if (template) {
                         setShiftInfo(`${template.name} (${template.startTime} - ${template.endTime})`);
                         // Auto-set OT Start Time to Shift End Time
                         setRequest(prev => ({ ...prev, startTime: template.endTime }));
                     }
                 }
            }
        }
    }, [isOpen, requestToEdit, user]); // Removed shiftAssignments from dep to avoid reset loops, managed logic inside
    
    // Validation Logic
    useEffect(() => {
        if (!isOpen || !request.date || !request.employeeId) return;

        const newWarnings: string[] = [];
        const planned = calculatePlannedHours(request.startTime || '', request.endTime || '');
        const dateStr = new Date(request.date).toDateString();

        // 1. Fatigue Warning
        if (planned > 4) {
            newWarnings.push('⚠️ High Duration: Overtime beyond 4 hours requires explicit manager approval to prevent fatigue.');
        }

        // 2. Attendance Conflict
        const conflict = attendanceRecords.some(rec => 
            rec.employeeId === request.employeeId &&
            new Date(rec.date).toDateString() === dateStr &&
            rec.exceptions.includes(AttendanceException.Absent)
        );
        if (conflict) {
            newWarnings.push('⚠️ Attendance Flag: You are marked as Absent on this date.');
        }
        
        // 3. Future Limit Check
        const futureLimit = new Date();
        futureLimit.setDate(futureLimit.getDate() + 14);
        if (new Date(request.date) > futureLimit) {
             newWarnings.push('⚠️ Advance Notice: You are filing for a date more than 2 weeks in advance.');
        }
        
        // 4. Shift Overlap Check
        const assignment = shiftAssignments.find(s => 
             s.employeeId === request.employeeId && 
             new Date(s.date).toDateString() === dateStr
        );
        if (assignment) {
            const template = shiftTemplates.find(t => t.id === assignment.shiftTemplateId);
            if (template && request.startTime && request.endTime) {
                if (isTimeOverlap(request.startTime, request.endTime, template.startTime, template.endTime)) {
                    newWarnings.push(`⚠️ Overlap Detected: OT overlaps with assigned shift (${template.startTime} - ${template.endTime}).`);
                }
            }
        }

        setWarnings(newWarnings);
    }, [request.startTime, request.endTime, request.date, request.employeeId, attendanceRecords, isOpen, shiftAssignments, shiftTemplates]);


    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        
        // Special handling for Date change to update Shift Info and Auto-Populate
        if (name === 'date') {
            const newDate = new Date(value);
            const dateStr = newDate.toDateString();
            const assignment = shiftAssignments.find(s => 
                 s.employeeId === request.employeeId && 
                 new Date(s.date).toDateString() === dateStr
            );
            
            let newStartTime = request.startTime;
            
            if (assignment) {
                 const template = shiftTemplates.find(t => t.id === assignment.shiftTemplateId);
                 if (template) {
                     setShiftInfo(`${template.name} (${template.startTime} - ${template.endTime})`);
                     // Only auto-fill if start time is empty to avoid overwriting user input
                     if (!request.startTime) {
                         newStartTime = template.endTime;
                     }
                 } else {
                     setShiftInfo('');
                 }
            } else {
                setShiftInfo('No shift assigned');
            }
            
            setRequest(prev => ({ ...prev, date: newDate, startTime: newStartTime }));
        } else {
             setRequest(prev => ({
                ...prev,
                [name]: type === 'date' ? new Date(value) : value,
            }));
        }
    };
    
    const handleFile = (file: File) => {
        console.log("Attachment uploaded:", file.name);
        setRequest(prev => ({ ...prev, attachmentUrl: file.name }));
    };

    const handleSaveDraftOrSubmit = (status: OTStatus) => {
        setError('');
        if (!request.date || !request.startTime || !request.endTime || !request.reason) {
            setError('Please fill out all required fields.');
            return;
        }
        const duration = calculatePlannedHours(request.startTime || '', request.endTime || '');
        if (duration <= 0) {
            setError('End time must be after start time, or check AM/PM.');
            return;
        }
        onSave(request, status);
    };

    const handleApprove = () => {
        const hours = parseFloat(approvedHours);
        if (isNaN(hours) || hours <= 0) {
            setError('Approved Hours must be a positive number.');
            return;
        }
        setError('');
        onApproveOrReject(request, OTStatus.Approved, { approvedHours: hours, managerNote });
    };

    const handleReject = () => {
        if (!managerNote.trim()) {
            setError('A note is required when rejecting a request.');
            return;
        }
        setError('');
        onApproveOrReject(request, OTStatus.Rejected, { managerNote, approvedHours: 0 });
    };

    const plannedHours = useMemo(() => calculatePlannedHours(request.startTime || '', request.endTime || ''), [request.startTime, request.endTime]);
    
    const isFinalized = request.status === OTStatus.Approved || request.status === OTStatus.Rejected;
    const isManagerReviewing = user?.role !== Role.Employee && requestToEdit?.employeeId !== user?.id && requestToEdit?.status === OTStatus.Submitted;
    const canApprove = can('OT', Permission.Approve);

    // Auto-set approved hours for manager convenience
    useEffect(() => {
        if (isManagerReviewing && !approvedHours) {
            setApprovedHours(plannedHours.toString());
        }
    }, [isManagerReviewing, plannedHours, approvedHours]);

    const renderFooter = () => {
        if (isManagerReviewing) {
            return (
                <div className="flex justify-between items-center w-full">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Planned: {plannedHours.toFixed(2)}h</span>
                    <div className="space-x-2">
                        <Button variant="secondary" onClick={onClose}>Cancel</Button>
                        <Button variant="danger" onClick={handleReject} disabled={!canApprove}>Reject</Button>
                        <Button variant="primary" onClick={handleApprove} disabled={!canApprove}>Approve</Button>
                    </div>
                </div>
            )
        }
        
        if (isFinalized) {
            return <div className="flex justify-end w-full"><Button variant="secondary" onClick={onClose}>Close</Button></div>;
        }

        return (
            <div className="flex justify-between items-center w-full">
                <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">Duration: {plannedHours.toFixed(2)} Hours</span>
                <div className="space-x-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => handleSaveDraftOrSubmit(OTStatus.Draft)}>Save Draft</Button>
                    <Button variant="primary" onClick={() => handleSaveDraftOrSubmit(OTStatus.Submitted)}>Submit</Button>
                </div>
            </div>
        )
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={requestToEdit ? `Overtime Request: ${requestToEdit.id}` : 'New Overtime Request'}
            footer={renderFooter()}
        >
            <div className="space-y-4">
                {shiftInfo && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 p-2 rounded">
                        <span className="font-semibold">Assigned Shift:</span> {shiftInfo}
                    </div>
                )}
                
                <Input
                    label="Date"
                    id="date"
                    name="date"
                    type="date"
                    value={request.date ? new Date(request.date).toISOString().split('T')[0] : ''}
                    onChange={handleChange}
                    required
                    disabled={isFinalized || isManagerReviewing || request.status === OTStatus.Submitted}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                        label="Start Time"
                        id="startTime"
                        name="startTime"
                        type="time"
                        value={request.startTime || ''}
                        onChange={handleChange}
                        required
                        disabled={isFinalized || isManagerReviewing || request.status === OTStatus.Submitted}
                    />
                    <Input
                        label="End Time"
                        id="endTime"
                        name="endTime"
                        type="time"
                        value={request.endTime || ''}
                        onChange={handleChange}
                        required
                        disabled={isFinalized || isManagerReviewing || request.status === OTStatus.Submitted}
                    />
                </div>
                
                <Textarea
                    label="Reason"
                    id="reason"
                    name="reason"
                    value={request.reason || ''}
                    onChange={handleChange}
                    required
                    disabled={isFinalized || isManagerReviewing}
                    placeholder="Why is overtime needed? (e.g. Critical report deadline)"
                />
                 <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Attach Note/File (Optional)</label>
                    <FileUploader onFileUpload={handleFile} />
                    {request.attachmentUrl && <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Current attachment: {request.attachmentUrl}</p>}
                </div>

                 {warnings.length > 0 && (
                    <div className="p-3 my-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-md space-y-1">
                        {warnings.map((warn, index) => (
                            <p key={index} className="text-sm text-yellow-800 dark:text-yellow-200">{warn}</p>
                        ))}
                    </div>
                )}
                {error && <p className="text-sm text-red-500 mt-2">{error}</p>}

                {(isManagerReviewing || isFinalized) && (
                     <div className="space-y-4 pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
                        <h4 className="text-lg font-medium text-gray-900 dark:text-white">Manager's Review</h4>
                         <Input
                            label="Approved Hours"
                            id="approvedHours"
                            name="approvedHours"
                            type="number"
                            step="0.25"
                            value={approvedHours}
                            onChange={(e) => setApprovedHours(e.target.value)}
                            disabled={isFinalized || !canApprove}
                            required={isManagerReviewing}
                        />
                        <Textarea
                            label="Manager Note (Required for Rejection)"
                            id="managerNote"
                            name="managerNote"
                            value={managerNote}
                            onChange={(e) => setManagerNote(e.target.value)}
                            disabled={isFinalized || !canApprove}
                        />
                     </div>
                )}
                
                {(request.historyLog && request.historyLog.length > 0) && (
                    <div className="space-y-2 pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
                        <h4 className="text-lg font-medium text-gray-900 dark:text-white">Request History</h4>
                        <ul className="space-y-3 max-h-40 overflow-y-auto pr-2">
                            {[...request.historyLog].reverse().map((log, index) => (
                                <li key={index} className="text-sm text-gray-600 dark:text-gray-400 border-l-2 border-gray-200 dark:border-gray-600 pl-3">
                                    <p>
                                        <span className="font-semibold text-gray-800 dark:text-gray-200">{log.userName}</span> ({log.action})
                                    </p>
                                    <p className="text-xs text-gray-500">{new Date(log.timestamp).toLocaleString()}</p>
                                    {log.details && <p className="text-xs mt-1 pl-2 italic">"{log.details}"</p>}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default OTRequestModal;
