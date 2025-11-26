import React, { useState, useEffect } from 'react';
import { TimeEvent, TimeEventType, ShiftAssignment, TimeEventSource, Site, DeviceSecurityProfile, AnomalyTag, TimeEventExtra } from '../../types';
import { mockSites, mockShiftTemplates } from '../../services/mockData';
import Button from '../ui/Button';
import { getAppVersion } from '../../services/deviceSecurity';

interface GpsClockProps {
    clockInStatus: 'in' | 'out';
    addTimeEvent: (newEvent: Omit<TimeEvent, 'id' | 'employeeId'>) => Promise<void>;
    todaysShift: ShiftAssignment | undefined;
    deviceSecurityProfile: DeviceSecurityProfile;
    isRetrying: boolean;
    retryCount: number;
}

type GpsStatus = 'idle' | 'requesting' | 'verifying' | 'success' | 'outside_fence' | 'error';

interface ValidationResult {
    site: Site;
    distance: number;
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

const GpsClock: React.FC<GpsClockProps> = ({ clockInStatus, addTimeEvent, todaysShift, deviceSecurityProfile, isRetrying, retryCount }) => {
    const [status, setStatus] = useState<GpsStatus>('idle');
    const [error, setError] = useState('');
    const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | null>(null);
    const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
    const [useWifi, setUseWifi] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const verifyLocation = (position: GeolocationPosition) => {
        setStatus('verifying');
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });

        let nearestSite: ValidationResult | null = null;

        for (const site of mockSites) {
            const distance = getHaversineDistance(latitude, longitude, site.latitude, site.longitude);
            if (!nearestSite || distance < nearestSite.distance) {
                nearestSite = { site, distance };
            }
        }

        if (nearestSite && (nearestSite.distance <= nearestSite.site.radiusMeters || (useWifi && todaysShift?.locationId === nearestSite.site.id))) {
            setStatus('success');
            setValidationResult(nearestSite);
        } else {
            setStatus('outside_fence');
            setValidationResult(nearestSite);
        }
    };

    const handleGetLocation = () => {
        setStatus('requesting');
        setError('');
        if (!navigator.geolocation) {
            setStatus('error');
            setError('Geolocation is not supported by your browser.');
            return;
        }
        navigator.geolocation.getCurrentPosition(verifyLocation, (err) => {
            setStatus('error');
            setError(`Failed to get location: ${err.message}`);
        });
    };
    
    useEffect(() => {
        if(userLocation){
            verifyLocation({coords: { latitude: userLocation.lat, longitude: userLocation.lng, accuracy: 0, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now()})
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [useWifi, todaysShift]);
    
    const isClockingDisabled = status !== 'success' || (useWifi && todaysShift?.locationId !== validationResult?.site.id);
    
    const getButtonText = () => {
        const action = clockInStatus === 'in' ? 'Clock Out via GPS' : 'Clock In via GPS';
        if (isRetrying) {
            return `Retrying... (${retryCount}/3)`;
        }
        return action;
    };


    const handleClockEvent = async () => {
        if (!validationResult) return;
        setIsSubmitting(true);

        const now = new Date();
        const nextType = clockInStatus === 'in' ? TimeEventType.ClockOut : TimeEventType.ClockIn;
        const anomaly_tags: AnomalyTag[] = [];

        if(useWifi) {
            anomaly_tags.push(AnomalyTag.OutsideFence);
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
        
        const extra: TimeEventExtra = {
            ...deviceSecurityProfile,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            app_version: getAppVersion(),
            ip_hash: `hash_${deviceSecurityProfile.deviceId.substring(4,10)}`,
            site_name: validationResult.site.name,
            anomaly_tags,
            lat: userLocation?.lat,
            lng: userLocation?.lng,
            wifi_ssid: useWifi ? mockSites.find(s=>s.id === validationResult.site.id)?.allowedWifiSSIDs?.[0] : undefined,
        };
        
        try {
            await addTimeEvent({
                timestamp: now,
                type: nextType,
                source: TimeEventSource.GPS,
                locationId: validationResult.site.id,
                extra,
            });
            alert(`Clock event for ${nextType} at ${validationResult.site.name} submitted!`);
            setStatus('idle');
        } catch (err) {
             alert('Failed to submit event after multiple retries. Please check your connection and try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center p-4 space-y-4 text-center">
            {status === 'idle' && (
                <Button onClick={handleGetLocation} size="lg">Verify My Location</Button>
            )}
            
            {(status === 'requesting' || status === 'verifying') && (
                 <div className="flex items-center text-gray-600 dark:text-gray-400">
                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-500 mr-3"></div>
                    {status === 'requesting' ? 'Requesting location...' : 'Verifying against work sites...'}
                </div>
            )}
            
            {error && <p className="text-red-500 text-sm">{error}</p>}
            
            {validationResult && (
                <div className="w-full max-w-md">
                     <div className={`p-4 rounded-lg border ${status === 'success' ? 'bg-green-50 border-green-300 dark:bg-green-900/20 dark:border-green-700' : 'bg-red-50 border-red-300 dark:bg-red-900/20 dark:border-red-700'}`}>
                        {status === 'success' ? (
                            <div>
                                <h3 className="text-lg font-semibold text-green-800 dark:text-green-200">Location Verified!</h3>
                                <p className="text-green-700 dark:text-green-300">You are at <strong>{validationResult.site.name}</strong> ({validationResult.distance.toFixed(0)}m away).</p>
                            </div>
                        ) : (
                             <div>
                                <h3 className="text-lg font-semibold text-red-800 dark:text-red-200">Outside Geo-fence</h3>
                                <p className="text-red-700 dark:text-red-300">
                                    You are not at an approved work site.
                                    The nearest site is <strong>{validationResult.site.name}</strong> ({validationResult.distance.toFixed(0)}m away).
                                </p>
                            </div>
                        )}
                    </div>
                     <div className="mt-4 flex items-center justify-center">
                        <input id="wifi-check" type="checkbox" checked={useWifi} onChange={(e) => setUseWifi(e.target.checked)} className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"/>
                        <label htmlFor="wifi-check" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">Simulate being on approved WiFi for your assigned site.</label>
                    </div>
                </div>
            )}
           
            {(status === 'success' || status === 'outside_fence') && (
                 <Button onClick={handleClockEvent} disabled={isClockingDisabled} className="mt-4 w-full max-w-sm" size="lg" isLoading={isSubmitting}>
                    {getButtonText()}
                </Button>
            )}

        </div>
    );
};

export default GpsClock;