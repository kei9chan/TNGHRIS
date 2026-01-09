
import React, { useState, useEffect } from 'react';
import { AttendanceRecord, TimeEventType, TimeEventSource, AnomalyTag, TimeEvent, TimeEventExtra } from '../../types';
import { useTimeClock } from '../../hooks/useTimeClock';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import { getAppVersion } from '../../services/deviceSecurity';

interface DailyRecordModalProps {
    isOpen: boolean;
    onClose: () => void;
    record: AttendanceRecord | null;
    onUpdate: () => void;
}

const DailyRecordModal: React.FC<DailyRecordModalProps> = ({ isOpen, onClose, record, onUpdate }) => {
    const { addBatchTimeEvents } = useTimeClock();
    const [inTime, setInTime] = useState('');
    const [outTime, setOutTime] = useState('');
    const [reason, setReason] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (isOpen && record) {
            setInTime(record.firstIn ? new Date(record.firstIn).toTimeString().slice(0, 5) : '');
            setOutTime(record.lastOut ? new Date(record.lastOut).toTimeString().slice(0, 5) : '');
            setReason('');
        }
    }, [isOpen, record]);

    const handleSave = async () => {
        if (!record) return;
        if (!reason.trim()) {
            alert('Please provide a reason for the adjustment.');
            return;
        }

        setIsLoading(true);
        const newEvents: TimeEvent[] = [];
        const baseDate = new Date(record.date);
        
        const createEvent = (type: TimeEventType, timeStr: string) => {
             const [h, m] = timeStr.split(':').map(Number);
             const timestamp = new Date(baseDate);
             timestamp.setHours(h, m, 0, 0);
             
             const extra: TimeEventExtra = {
                timezone: 'Asia/Manila',
                app_version: getAppVersion(),
                ip_hash: 'MANUAL_ADJUSTMENT',
                site_name: 'Manual Adjustment',
                anomaly_tags: [AnomalyTag.Manual],
                platform: 'web',
                jailbreak_flag: false,
                emulator_flag: false,
                deviceId: 'SYSTEM',
                note: reason,
            };
            
            return {
                id: `MANUAL-${record.employeeId}-${timestamp.getTime()}`,
                employeeId: record.employeeId,
                timestamp,
                type,
                source: TimeEventSource.Manual,
                locationId: '',
                extra
            };
        };

        if (inTime) {
            // Logic could be improved to update existing event instead of adding new one
            // For prototype, we push a new manual event which the generator picks up
            newEvents.push(createEvent(TimeEventType.ClockIn, inTime));
        }
        if (outTime) {
            newEvents.push(createEvent(TimeEventType.ClockOut, outTime));
        }

        await addBatchTimeEvents(newEvents);
        setIsLoading(false);
        onUpdate();
        onClose();
    };

    if (!record) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Fix Record: ${record.employeeName} - ${new Date(record.date).toLocaleDateString()}`}
            footer={
                <div className="flex justify-end w-full space-x-2">
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave} isLoading={isLoading}>Save Adjustments</Button>
                </div>
            }
        >
            <div className="space-y-4">
                <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded-md text-sm">
                    <p><strong>Scheduled:</strong> {record.shiftName} ({record.scheduledStart ? new Date(record.scheduledStart).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : 'N/A'} - {record.scheduledEnd ? new Date(record.scheduledEnd).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : 'N/A'})</p>
                    <p><strong>Current Logs:</strong> {record.firstIn ? new Date(record.firstIn).toLocaleTimeString() : '--:--'} - {record.lastOut ? new Date(record.lastOut).toLocaleTimeString() : '--:--'}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <Input 
                        label="Adjusted Time In" 
                        type="time" 
                        value={inTime} 
                        onChange={e => setInTime(e.target.value)} 
                    />
                    <Input 
                        label="Adjusted Time Out" 
                        type="time" 
                        value={outTime} 
                        onChange={e => setOutTime(e.target.value)} 
                    />
                </div>
                
                <Textarea 
                    label="Reason for Adjustment" 
                    value={reason} 
                    onChange={e => setReason(e.target.value)} 
                    required 
                    placeholder="e.g., Forgot to clock out due to rush..."
                />
            </div>
        </Modal>
    );
};

export default DailyRecordModal;
