import React, { useState, useEffect } from 'react';
import { TimeEvent, TimeEventType, ShiftAssignment, TimeEventSource, DeviceSecurityProfile, AnomalyTag, TimeEventExtra } from '../../types';
import Button from '../ui/Button';
import { mockShiftTemplates, mockSites } from '../../services/mockData';
import { getAppVersion } from '../../services/deviceSecurity';


interface QrClockProps {
    clockInStatus: 'in' | 'out';
    addTimeEvent: (newEvent: Omit<TimeEvent, 'id' | 'employeeId'>) => Promise<void>;
    todaysShift: ShiftAssignment | undefined;
    deviceSecurityProfile: DeviceSecurityProfile;
    isRetrying: boolean;
    retryCount: number;
}

const QrCodeIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-32 w-32 text-gray-700 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={0.5} d="M12 4v16m8-8H4" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={0.5} d="M3.5 3.5h17v17h-17z M8.5 8.5h7v7h-7z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5 5h2v2H5z M17 5h2v2h-2z M5 17h2v2H5z M17 17h2v2h-2z"/>
    </svg>
);


const QrClock: React.FC<QrClockProps> = ({ clockInStatus, addTimeEvent, todaysShift, deviceSecurityProfile, isRetrying, retryCount }) => {
    const [totp, setTotp] = useState('');
    const [timeLeft, setTimeLeft] = useState(30);
    const [isExpired, setIsExpired] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const generateTotp = () => {
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        setTotp(code);
        setIsExpired(false);
    };

    useEffect(() => {
        generateTotp(); // Initial code
        const interval = setInterval(() => {
            setTimeLeft(prev => {
                if (prev === 1) {
                    setIsExpired(true);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const handleResetCode = () => {
        setTimeLeft(30);
        generateTotp();
    };

    const handleScan = async () => {
        setIsSubmitting(true);
        const now = new Date();
        const nextType = clockInStatus === 'in' ? TimeEventType.ClockOut : TimeEventType.ClockIn;
        const anomaly_tags: AnomalyTag[] = [];

        if (isExpired) {
            anomaly_tags.push(AnomalyTag.ExpiredQR);
        }
        
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

        const siteName = mockSites.find(s => s.id === todaysShift?.locationId)?.name || 'Unknown Site';
        const extra: TimeEventExtra = {
            ...deviceSecurityProfile,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            app_version: getAppVersion(),
            ip_hash: `hash_${deviceSecurityProfile.deviceId.substring(4,10)}`,
            site_name: siteName,
            anomaly_tags
        };

        try {
            await addTimeEvent({
                timestamp: now,
                type: nextType,
                source: TimeEventSource.QR,
                locationId: todaysShift?.locationId || 'KIOSK-01',
                extra,
            });
            alert(`Simulated QR scan successful for ${nextType}!`);
            handleResetCode();
        } catch (err) {
            alert('Failed to submit event after multiple retries. Please try scanning again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const progressPercentage = (timeLeft / 30) * 100;
    
    const getButtonText = () => {
        const action = clockInStatus === 'in' ? 'Scan & Clock Out' : 'Scan & Clock In';
         if (isRetrying) {
            return `Retrying... (${retryCount}/3)`;
        }
        return action;
    }

    return (
        <div className="flex flex-col items-center justify-center p-4 space-y-4">
            <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">Kiosk Code</h3>
            <div className="p-4 bg-white dark:bg-gray-900 border rounded-lg">
                <QrCodeIcon />
            </div>
            <div className="text-center">
                <p className={`text-4xl font-bold tracking-widest text-gray-900 dark:text-white font-mono ${isExpired ? 'text-red-500' : ''}`}>{isExpired ? 'EXPIRED' : totp}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    {isExpired ? 'Code has expired.' : `Code refreshes in ${timeLeft}s`}
                </p>
            </div>
            <div className="w-full max-w-xs">
                <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                    <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-1000 ease-linear" style={{ width: `${progressPercentage}%` }}></div>
                </div>
            </div>
            {isExpired ? (
                <Button onClick={handleResetCode} className="mt-4 w-full max-w-xs" size="lg" variant="secondary">
                    Generate New Code
                </Button>
            ) : (
                <Button onClick={handleScan} className="mt-4 w-full max-w-xs" size="lg" isLoading={isSubmitting}>
                    {getButtonText()}
                </Button>
            )}
        </div>
    );
};

export default QrClock;