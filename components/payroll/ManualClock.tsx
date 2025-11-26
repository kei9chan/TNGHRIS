import React, { useState } from 'react';
import { TimeEvent, TimeEventType, ShiftAssignment, TimeEventSource, DeviceSecurityProfile, AnomalyTag, TimeEventExtra } from '../../types';
import Input from '../ui/Input';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import { mockShiftTemplates, mockSites } from '../../services/mockData';
import { getAppVersion } from '../../services/deviceSecurity';

interface ManualClockProps {
    clockInStatus: 'in' | 'out';
    addTimeEvent: (newEvent: Omit<TimeEvent, 'id' | 'employeeId'>) => Promise<void>;
    todaysShift: ShiftAssignment | undefined;
    deviceSecurityProfile: DeviceSecurityProfile;
    isRetrying: boolean;
    retryCount: number;
}

const ManualClock: React.FC<ManualClockProps> = ({ clockInStatus, addTimeEvent, todaysShift, deviceSecurityProfile, isRetrying, retryCount }) => {
    const [pin, setPin] = useState('');
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (pin.length < 4 || pin.length > 6) {
            setError('PIN must be between 4 and 6 digits.');
            return;
        }

        setIsSubmitting(true);
        const now = new Date();
        const nextType = clockInStatus === 'in' ? TimeEventType.ClockOut : TimeEventType.ClockIn;
        const anomaly_tags: AnomalyTag[] = [AnomalyTag.Manual];

        if (todaysShift && nextType === TimeEventType.ClockIn) {
            const shiftTemplate = mockShiftTemplates.find(st => st.id === todaysShift.shiftTemplateId);
            const site = mockSites.find(s => s.id === todaysShift.locationId);
            if(shiftTemplate) {
                const gracePeriod = site?.gracePeriodMinutes ?? shiftTemplate.gracePeriodMinutes;
                const [hours, minutes] = shiftTemplate.startTime.split(':').map(Number);
                const shiftStart = new Date(todaysShift.date);
                shiftStart.setHours(hours, minutes + gracePeriod, 0, 0);
                if (now > shiftStart) {
                    anomaly_tags.push(AnomalyTag.LateIn);
                }
            }
        }
        
        const siteName = mockSites.find(s => s.id === todaysShift?.locationId)?.name || 'Manual Entry';
        const extra: TimeEventExtra = {
            ...deviceSecurityProfile,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            app_version: getAppVersion(),
            ip_hash: `hash_${deviceSecurityProfile.deviceId.substring(4,10)}`,
            site_name: siteName,
            anomaly_tags,
            pin_last2: pin.slice(-2),
            note: reason,
        };
        
        try {
            await addTimeEvent({
                timestamp: now,
                type: nextType,
                source: TimeEventSource.Manual,
                locationId: todaysShift?.locationId || 'MANUAL_ENTRY',
                extra,
            });
            alert(`Manual entry for ${nextType} submitted successfully!`);
            setPin('');
            setReason('');
        } catch (err) {
            console.error(err);
            setError('Failed to submit event after multiple retries. Please check your connection.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const getButtonText = () => {
        const action = clockInStatus === 'in' ? 'Clock Out with PIN' : 'Clock In with PIN';
        if (isRetrying) {
            return `Retrying... (${retryCount}/3)`;
        }
        return action;
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 max-w-sm mx-auto text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">Manual clock-in/out should only be used as a backup and requires a valid security PIN.</p>
            <Input
                label="Security PIN (4-6 digits)"
                id="pin"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                required
                maxLength={6}
                minLength={4}
                error={error}
            />
             <Textarea
                label="Reason (Optional)"
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
            />
            <Button type="submit" className="w-full" isLoading={isSubmitting}>
                {getButtonText()}
            </Button>
        </form>
    );
};

export default ManualClock;