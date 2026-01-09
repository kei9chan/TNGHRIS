
import React, { useState, useEffect } from 'react';
import { useTimeClock } from '../../hooks/useTimeClock';
import { DeviceSecurityProfile, Role, Permission } from '../../types';
import { checkDeviceSecurity } from '../../services/deviceSecurity';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import MobileCheckIn from '../../components/payroll/MobileCheckIn';
import ManualClock from '../../components/payroll/ManualClock';
import QrClock from '../../components/payroll/QrClock';
import PhotoClock from '../../components/payroll/PhotoClock'; // Legacy web photo
import BiometricsUpload from '../../components/payroll/BiometricsUpload';
import DeviceSecurityBanner from '../../components/payroll/DeviceSecurityBanner';
import ManagerPinAuth from '../../components/payroll/ManagerPinAuth';

type InputMethod = 'mobile' | 'kiosk' | 'manual' | 'biometrics' | 'web-photo';

// Icons
const DevicePhoneMobileIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>;
const QrCodeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>;
const FingerPrintIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" /></svg>;
const KeyIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>;
const CameraIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;

const ClockInOut: React.FC = () => {
    const { user } = useAuth();
    const { can } = usePermissions();
    const [activeMethod, setActiveMethod] = useState<InputMethod>('mobile');
    const [securityProfile, setSecurityProfile] = useState<DeviceSecurityProfile | null>(null);
    const [isManagerAuthorized, setIsManagerAuthorized] = useState(false);
    const [isDeviceRooted, setIsDeviceRooted] = useState(false);
    
    const { isLoading, clockInStatus, lastEvent, todaysShift, addTimeEvent, isRetrying, retryCount, autoCloseStaleShifts } = useTimeClock();
    const canView = can('Clock', Permission.View);

    useEffect(() => {
        const profile = checkDeviceSecurity(isDeviceRooted);
        setSecurityProfile(profile);
    }, [isDeviceRooted]);
    
    const handleMethodChange = (method: InputMethod) => {
        if (method !== 'manual') setIsManagerAuthorized(false);
        setActiveMethod(method);
    };
    
    if (!user) return <div>Loading...</div>;
    if (!canView) {
        return (
            <div className="p-6">
                <Card>
                    <div className="p-6 text-center text-gray-600 dark:text-gray-300">
                        You do not have permission to access Clock In/Out.
                    </div>
                </Card>
            </div>
        );
    }
    if (isLoading) return <div>Loading...</div>;

    const isPrivileged = [Role.Admin, Role.HRManager, Role.HRStaff, Role.Manager].includes(user.role);
    const isDeviceBlocked = securityProfile?.jailbreak_flag || securityProfile?.emulator_flag;

    return (
        <div className="space-y-6">
             <div className="flex flex-col md:flex-row justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Timekeeping Console</h1>
                    <p className="text-gray-600 dark:text-gray-400">Select your input method to log time.</p>
                </div>
                <div className="mt-4 md:mt-0 text-center">
                    <span className="text-sm text-gray-500 dark:text-gray-400 uppercase tracking-wide">Current Status</span>
                    <div className={`text-2xl font-bold ${clockInStatus === 'in' ? 'text-green-500' : 'text-red-500'}`}>
                         {clockInStatus === 'in' ? 'CLOCKED IN' : 'CLOCKED OUT'}
                    </div>
                     {lastEvent && (
                        <p className="text-xs text-gray-400">
                            Last: {lastEvent.type.replace('_', ' ')} @ {new Date(lastEvent.timestamp).toLocaleTimeString()}
                        </p>
                    )}
                </div>
            </div>

            {securityProfile && <DeviceSecurityBanner profile={securityProfile} />}

            {/* Input Method Selector */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                <button 
                    onClick={() => handleMethodChange('mobile')}
                    className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all ${activeMethod === 'mobile' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                    disabled={isDeviceBlocked}
                >
                    <DevicePhoneMobileIcon />
                    <span className="mt-2 text-sm font-medium">Mobile GPS</span>
                </button>
                
                <button 
                    onClick={() => handleMethodChange('kiosk')}
                    className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all ${activeMethod === 'kiosk' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                    disabled={isDeviceBlocked}
                >
                    <QrCodeIcon />
                    <span className="mt-2 text-sm font-medium">QR Kiosk</span>
                </button>
                
                 <button 
                    onClick={() => handleMethodChange('web-photo')}
                    className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all ${activeMethod === 'web-photo' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                    disabled={isDeviceBlocked}
                >
                    <CameraIcon />
                    <span className="mt-2 text-sm font-medium">Web Photo</span>
                </button>

                 {isPrivileged && (
                    <button 
                        onClick={() => handleMethodChange('manual')}
                        className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all ${activeMethod === 'manual' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                    >
                        <KeyIcon />
                        <span className="mt-2 text-sm font-medium">Manual / Supv</span>
                    </button>
                 )}
                 
                 {isPrivileged && (
                     <button 
                        onClick={() => handleMethodChange('biometrics')}
                        className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all ${activeMethod === 'biometrics' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                    >
                        <FingerPrintIcon />
                        <span className="mt-2 text-sm font-medium">Biometrics</span>
                    </button>
                 )}
            </div>

            {/* Active Input Component */}
            <div className="mt-6">
                {activeMethod === 'mobile' && securityProfile && (
                    <MobileCheckIn 
                         clockInStatus={clockInStatus}
                         addTimeEvent={addTimeEvent}
                         todaysShift={todaysShift}
                         deviceSecurityProfile={securityProfile}
                         isRetrying={isRetrying}
                         retryCount={retryCount}
                    />
                )}
                
                {activeMethod === 'kiosk' && securityProfile && (
                    <Card title="QR Kiosk Mode">
                        <QrClock 
                             clockInStatus={clockInStatus}
                             addTimeEvent={addTimeEvent}
                             todaysShift={todaysShift}
                             deviceSecurityProfile={securityProfile}
                             isRetrying={isRetrying}
                             retryCount={retryCount}
                        />
                    </Card>
                )}
                
                {activeMethod === 'web-photo' && securityProfile && (
                     <Card title="Webcam Photo Clock">
                        <PhotoClock
                             clockInStatus={clockInStatus}
                             addTimeEvent={addTimeEvent}
                             todaysShift={todaysShift}
                             deviceSecurityProfile={securityProfile}
                             isRetrying={isRetrying}
                             retryCount={retryCount}
                        />
                    </Card>
                )}

                {activeMethod === 'manual' && securityProfile && (
                    <Card title="Supervisor Manual Entry">
                        {isManagerAuthorized ? (
                             <ManualClock 
                                clockInStatus={clockInStatus}
                                addTimeEvent={addTimeEvent}
                                todaysShift={todaysShift}
                                deviceSecurityProfile={securityProfile}
                                isRetrying={isRetrying}
                                retryCount={retryCount}
                            />
                        ) : (
                            <ManagerPinAuth onAuthSuccess={() => setIsManagerAuthorized(true)} />
                        )}
                    </Card>
                )}
                
                {activeMethod === 'biometrics' && (
                    <Card title="Biometrics Log Import">
                        <BiometricsUpload />
                    </Card>
                )}
            </div>
            
            {/* Debug Footer */}
            <div className="mt-8 pt-4 border-t dark:border-gray-700 text-center text-xs text-gray-400">
                <button onClick={() => setIsDeviceRooted(!isDeviceRooted)} className="underline hover:text-gray-300">
                    Toggle Root/Jailbreak Simulation
                </button>
                <span className="mx-2">|</span>
                <button onClick={async () => { await autoCloseStaleShifts(12); alert('Ran stale shift cleaner'); }} className="underline hover:text-gray-300">
                    Run Auto-Close
                </button>
            </div>
        </div>
    );
};

export default ClockInOut;
