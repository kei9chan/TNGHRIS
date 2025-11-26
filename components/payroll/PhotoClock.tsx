import React, { useState, useRef, useCallback } from 'react';
import { TimeEvent, TimeEventType, ShiftAssignment, TimeEventSource, DeviceSecurityProfile, AnomalyTag, TimeEventExtra } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import Button from '../ui/Button';
import { mockShiftTemplates, mockSites } from '../../services/mockData';
import { getAppVersion } from '../../services/deviceSecurity';

interface PhotoClockProps {
    clockInStatus: 'in' | 'out';
    addTimeEvent: (newEvent: Omit<TimeEvent, 'id' | 'employeeId'>) => Promise<void>;
    todaysShift: ShiftAssignment | undefined;
    deviceSecurityProfile: DeviceSecurityProfile;
    isRetrying: boolean;
    retryCount: number;
}

const CameraIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;

const PhotoClock: React.FC<PhotoClockProps> = ({ clockInStatus, addTimeEvent, todaysShift, deviceSecurityProfile, isRetrying, retryCount }) => {
    const { user } = useAuth();
    const [isCameraOn, setIsCameraOn] = useState(false);
    const [photoData, setPhotoData] = useState<string | null>(null);
    const [retakeCount, setRetakeCount] = useState(0);
    const [simulateFail, setSimulateFail] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            setIsCameraOn(true);
            setPhotoData(null);
        } catch (err) {
            console.error("Error accessing camera:", err);
            alert("Could not access the camera. Please check permissions.");
        }
    };

    const stopCamera = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
        setIsCameraOn(false);
    };

    const takePhoto = useCallback(() => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            
            const MAX_WIDTH = 640;
            const scale = MAX_WIDTH / video.videoWidth;
            canvas.width = MAX_WIDTH;
            canvas.height = video.videoHeight * scale;

            canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
            setPhotoData(canvas.toDataURL('image/jpeg', 0.9));
            stopCamera();
            setRetakeCount(prev => prev + 1);
        }
    }, [videoRef, canvasRef]);

    const handleClockEvent = async () => {
        if (!photoData) {
            alert("Please take a photo first.");
            return;
        }
        
        setIsSubmitting(true);
        const now = new Date();
        const nextType = clockInStatus === 'in' ? TimeEventType.ClockOut : TimeEventType.ClockIn;
        const anomaly_tags: AnomalyTag[] = [];

        if (simulateFail && retakeCount > 1) {
            anomaly_tags.push(AnomalyTag.FailedLiveness);
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
            anomaly_tags,
            liveness: (simulateFail && retakeCount > 1) ? "fail" : "pass", 
            face_score: 0.83, 
            model: "facenet-lite-v2",
        };

        try {
            await addTimeEvent({
                timestamp: now,
                type: nextType,
                source: TimeEventSource.Photo,
                locationId: todaysShift?.locationId || 'WEB_PHOTO',
                extra,
            });
            alert(`Clock event for ${nextType} with photo submitted!`);
            setPhotoData(null);
            setRetakeCount(0);
        } catch(err) {
            alert('Failed to submit clock event after multiple retries. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };
    
    if (!user?.isPhotoEnrolled) {
        return (
            <div className="text-center p-8 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg">
                <h3 className="font-semibold text-yellow-800 dark:text-yellow-200">Photo Clock Not Enabled</h3>
                <p className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                    Your account is not yet enrolled for Photo Clock. Please contact HR or use another clock-in method.
                </p>
            </div>
        );
    }
    
    const getButtonText = () => {
        const action = clockInStatus === 'in' ? 'Clock Out with Photo' : 'Clock In with Photo';
        if (isRetrying) {
            return `Retrying... (${retryCount}/3)`;
        }
        return action;
    }

    return (
        <div className="flex flex-col items-center justify-center p-4 space-y-4">
            <div className="w-full max-w-md bg-gray-200 dark:bg-gray-800 rounded-lg overflow-hidden aspect-video flex items-center justify-center">
                {isCameraOn ? (
                    <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                ) : photoData ? (
                    <img src={photoData} alt="Captured" className="w-full h-full object-cover" />
                ) : (
                    <div className="text-gray-500">Camera is off</div>
                )}
                <canvas ref={canvasRef} className="hidden" />
            </div>

            <div className="flex space-x-2">
                {!isCameraOn && (
                    <Button onClick={startCamera} isLoading={isSubmitting}>
                        <CameraIcon /> {photoData ? 'Retake Photo' : 'Start Camera'}
                    </Button>
                )}
                {isCameraOn && (
                     <Button onClick={takePhoto}>Take Photo</Button>
                )}
                 {photoData && (
                    <Button onClick={handleClockEvent} isLoading={isSubmitting}>
                       {getButtonText()}
                    </Button>
                 )}
            </div>
             <div className="flex items-center">
                <input id="liveness-fail-check" type="checkbox" checked={simulateFail} onChange={(e) => setSimulateFail(e.target.checked)} className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"/>
                <label htmlFor="liveness-fail-check" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">Simulate Liveness Fail (if photo is retaken)</label>
            </div>
        </div>
    );
};

export default PhotoClock;