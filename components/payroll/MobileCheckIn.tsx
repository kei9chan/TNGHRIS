
import React, { useState, useRef, useEffect } from 'react';
import { TimeEvent, TimeEventType, ShiftAssignment, TimeEventSource, DeviceSecurityProfile, AnomalyTag, TimeEventExtra, Site } from '../../types';
import { mockSites, mockShiftTemplates } from '../../services/mockData';
import Button from '../ui/Button';
import { getAppVersion } from '../../services/deviceSecurity';
import Card from '../ui/Card';

interface MobileCheckInProps {
    clockInStatus: 'in' | 'out';
    addTimeEvent: (newEvent: Omit<TimeEvent, 'id' | 'employeeId'>) => Promise<void>;
    todaysShift: ShiftAssignment | undefined;
    deviceSecurityProfile: DeviceSecurityProfile;
    isRetrying: boolean;
    retryCount: number;
}

// Haversine distance formula
const getHaversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // in metres
};

const CameraIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
const MapPinIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;


const MobileCheckIn: React.FC<MobileCheckInProps> = ({ clockInStatus, addTimeEvent, todaysShift, deviceSecurityProfile, isRetrying, retryCount }) => {
    const [step, setStep] = useState<'gps' | 'camera' | 'confirm'>('gps');
    const [gpsStatus, setGpsStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle');
    const [nearestSite, setNearestSite] = useState<{ site: Site, distance: number } | null>(null);
    const [gpsCoords, setGpsCoords] = useState<{lat: number, lng: number} | null>(null);
    const [photoData, setPhotoData] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const verifyLocation = (position: GeolocationPosition) => {
        const { latitude, longitude } = position.coords;
        setGpsCoords({ lat: latitude, lng: longitude });
        
        let foundSite: { site: Site, distance: number } | null = null;
        for (const site of mockSites) {
            const distance = getHaversineDistance(latitude, longitude, site.latitude, site.longitude);
            if (!foundSite || distance < foundSite.distance) {
                foundSite = { site, distance };
            }
        }
        
        setNearestSite(foundSite);
        
        // Check if within radius (allowing a small buffer for GPS drift if needed, e.g. +20m)
        if (foundSite && foundSite.distance <= foundSite.site.radiusMeters + 50) {
            setGpsStatus('success');
            setTimeout(() => setStep('camera'), 1500); // Auto-advance
        } else {
            setGpsStatus('error'); // Outside fence
        }
    };

    const startGpsCheck = () => {
        setGpsStatus('verifying');
        if (!navigator.geolocation) {
            setGpsStatus('error');
            alert("Geolocation not supported");
            return;
        }
        navigator.geolocation.getCurrentPosition(verifyLocation, (err) => {
            console.error(err);
            setGpsStatus('error');
        });
    };

    // Camera Logic
    useEffect(() => {
        let stream: MediaStream | null = null;
        if (step === 'camera') {
            (async () => {
                try {
                    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                    }
                } catch (err) {
                    console.error("Camera error", err);
                    alert("Could not access camera.");
                    setStep('gps');
                }
            })();
        }
        return () => {
            if (stream) stream.getTracks().forEach(track => track.stop());
        };
    }, [step]);

    const takePhoto = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            
            const MAX_WIDTH = 400;
            const scale = MAX_WIDTH / video.videoWidth;
            canvas.width = MAX_WIDTH;
            canvas.height = video.videoHeight * scale;

            canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
            setPhotoData(canvas.toDataURL('image/jpeg', 0.8));
            setStep('confirm');
        }
    };

    const handleSubmit = async () => {
        if (!nearestSite || !gpsCoords || !photoData) return;
        setIsSubmitting(true);
        
        const now = new Date();
        const nextType = clockInStatus === 'in' ? TimeEventType.ClockOut : TimeEventType.ClockIn;
        const anomaly_tags: AnomalyTag[] = []; // Clean unless specific issues found
        
        // Logic for Late In check
        if (todaysShift && nextType === TimeEventType.ClockIn) {
             const shiftTemplate = mockShiftTemplates.find(st => st.id === todaysShift.shiftTemplateId);
             const site = mockSites.find(s => s.id === todaysShift.locationId);
             if (shiftTemplate) {
                 const grace = site?.gracePeriodMinutes ?? shiftTemplate.gracePeriodMinutes;
                 const [h, m] = shiftTemplate.startTime.split(':').map(Number);
                 const start = new Date(todaysShift.date);
                 start.setHours(h, m + grace, 0, 0);
                 if (now > start) anomaly_tags.push(AnomalyTag.LateIn);
             }
        }
        
        const extra: TimeEventExtra = {
            ...deviceSecurityProfile,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            app_version: getAppVersion(),
            ip_hash: `mob_${deviceSecurityProfile.deviceId.substring(0,5)}`,
            site_name: nearestSite.site.name,
            anomaly_tags,
            lat: gpsCoords.lat,
            lng: gpsCoords.lng,
            liveness: 'pass', // Assuming basic photo is "pass" for now
            face_score: 0.95
        };
        
        try {
            await addTimeEvent({
                timestamp: now,
                type: nextType,
                source: TimeEventSource.Mobile,
                locationId: nearestSite.site.id,
                extra
            });
            alert("Mobile Log Submitted Successfully!");
            setStep('gps'); // Reset
            setPhotoData(null);
            setGpsStatus('idle');
        } catch (e) {
            alert("Failed to submit log. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderStep = () => {
        switch(step) {
            case 'gps':
                return (
                    <div className="text-center space-y-6 py-8">
                        <div className="flex justify-center">
                            <div className={`p-6 rounded-full ${gpsStatus === 'verifying' ? 'bg-blue-100 animate-pulse' : gpsStatus === 'success' ? 'bg-green-100' : gpsStatus === 'error' ? 'bg-red-100' : 'bg-gray-100'}`}>
                                <MapPinIcon />
                            </div>
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Location Check</h3>
                            <p className="text-gray-500 mt-2">We need to verify you are at a valid work site before logging time.</p>
                        </div>
                        {gpsStatus === 'success' && nearestSite && (
                            <div className="text-green-600">
                                Verified: <strong>{nearestSite.site.name}</strong>
                            </div>
                        )}
                        {gpsStatus === 'error' && (
                            <div className="text-red-600">
                                {nearestSite ? `Too far from ${nearestSite.site.name} (${nearestSite.distance.toFixed(0)}m)` : "Location verification failed."}
                            </div>
                        )}
                        {gpsStatus !== 'success' && (
                            <Button size="lg" className="w-full" onClick={startGpsCheck} isLoading={gpsStatus === 'verifying'}>
                                Verify Location
                            </Button>
                        )}
                    </div>
                );
            case 'camera':
                return (
                    <div className="text-center space-y-4">
                        <h3 className="text-lg font-bold">Take a Selfie</h3>
                        <div className="rounded-lg overflow-hidden bg-black aspect-[3/4] relative">
                            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                        </div>
                        <Button size="lg" className="w-full" onClick={takePhoto}>Capture</Button>
                        <canvas ref={canvasRef} className="hidden" />
                    </div>
                );
            case 'confirm':
                return (
                    <div className="text-center space-y-4">
                        <h3 className="text-lg font-bold">Confirm Log</h3>
                        <div className="rounded-lg overflow-hidden bg-black aspect-[3/4] relative">
                            {photoData && <img src={photoData} alt="Selfie" className="w-full h-full object-cover" />}
                        </div>
                        <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-md text-left text-sm space-y-1">
                            <p><strong>Time:</strong> {new Date().toLocaleTimeString()}</p>
                            <p><strong>Action:</strong> {clockInStatus === 'in' ? 'Clock OUT' : 'Clock IN'}</p>
                            <p><strong>Location:</strong> {nearestSite?.site.name}</p>
                        </div>
                        <div className="flex space-x-2">
                            <Button variant="secondary" className="flex-1" onClick={() => { setPhotoData(null); setStep('camera'); }}>Retake</Button>
                            <Button className="flex-1" onClick={handleSubmit} isLoading={isSubmitting}>Submit</Button>
                        </div>
                    </div>
                );
        }
    }

    return (
        <Card title="Mobile Check-In">
            {renderStep()}
        </Card>
    );
};

export default MobileCheckIn;
