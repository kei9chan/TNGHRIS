
import React, { useState } from 'react';
import { TimeEvent, TimeEventType, TimeEventSource, TimeEventExtra, AnomalyTag } from '../../types';
import { mockUsers, mockSites } from '../../services/mockData';
import { useTimeClock } from '../../hooks/useTimeClock';
import Card from '../ui/Card';
import Button from '../ui/Button';
import FileUploader from '../ui/FileUploader';
import { getAppVersion } from '../../services/deviceSecurity';

const BiometricsUpload: React.FC = () => {
    const { addBatchTimeEvents } = useTimeClock();
    const [file, setFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [resultMessage, setResultMessage] = useState('');

    const handleUpload = async () => {
        if (!file) return;
        setIsProcessing(true);
        setResultMessage('');

        try {
            // Simulate file parsing delay
            await new Promise(resolve => setTimeout(resolve, 1000));

            // MOCK PARSING LOGIC:
            // In a real app, we would parse the CSV/Excel file here.
            // For this prototype, we will generate random logs for a few employees for the past week.
            
            const newEvents: TimeEvent[] = [];
            const targetEmployees = mockUsers.slice(0, 5); // Generate logs for first 5 users
            const site = mockSites[0]; // Assume logs are from the main office
            const today = new Date();

            targetEmployees.forEach(emp => {
                // Generate logs for the last 3 days
                for (let i = 1; i <= 3; i++) {
                    const date = new Date(today);
                    date.setDate(date.getDate() - i);
                    
                    // Clock In ~ 8:00 AM
                    const clockInTime = new Date(date);
                    clockInTime.setHours(8, Math.floor(Math.random() * 30), 0); // Random minute 0-30
                    
                    // Clock Out ~ 5:00 PM
                    const clockOutTime = new Date(date);
                    clockOutTime.setHours(17, Math.floor(Math.random() * 30), 0);

                    const extra: TimeEventExtra = {
                        timezone: 'Asia/Manila',
                        app_version: getAppVersion(),
                        ip_hash: 'BIO_DEVICE_01',
                        site_name: site.name,
                        anomaly_tags: [],
                        platform: 'biometric_device',
                        jailbreak_flag: false,
                        emulator_flag: false,
                        deviceId: 'BIO-001'
                    };

                    newEvents.push({
                        id: `BIO-${emp.id}-${clockInTime.getTime()}`,
                        employeeId: emp.id,
                        timestamp: clockInTime,
                        type: TimeEventType.ClockIn,
                        source: TimeEventSource.Biometric,
                        locationId: site.id,
                        extra: { ...extra }
                    });

                     newEvents.push({
                        id: `BIO-${emp.id}-${clockOutTime.getTime()}`,
                        employeeId: emp.id,
                        timestamp: clockOutTime,
                        type: TimeEventType.ClockOut,
                        source: TimeEventSource.Biometric,
                        locationId: site.id,
                        extra: { ...extra }
                    });
                }
            });

            await addBatchTimeEvents(newEvents);
            setResultMessage(`Successfully processed ${newEvents.length} logs from ${file.name}.`);
            setFile(null);
        } catch (error) {
            console.error(error);
            setResultMessage('Error processing file. Please ensure it matches the template.');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
                Upload biometric logs (CSV/Excel) from supported devices. The system will automatically parse and match logs to employees based on Employee ID.
            </p>
            
            <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-6 text-center">
                 <FileUploader onFileUpload={setFile} />
                 {file && (
                     <div className="mt-4">
                        <p className="font-semibold text-gray-800 dark:text-gray-200">{file.name}</p>
                        <Button onClick={handleUpload} isLoading={isProcessing} className="mt-2">
                            Process & Import Logs
                        </Button>
                     </div>
                 )}
            </div>

            {resultMessage && (
                <div className={`p-4 rounded-md ${resultMessage.includes('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                    {resultMessage}
                </div>
            )}

            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-md text-sm text-blue-800 dark:text-blue-200">
                <h4 className="font-bold mb-1">Supported Formats</h4>
                <ul className="list-disc pl-5">
                    <li>ZKTeco (Dat format)</li>
                    <li>Hikvision (CSV export)</li>
                    <li>Generic CSV (EmployeeID, DateTime, Type)</li>
                </ul>
            </div>
        </div>
    );
};

export default BiometricsUpload;
