import React from 'react';
import { DeviceSecurityProfile } from '../../types';

interface DeviceSecurityBannerProps {
    profile: DeviceSecurityProfile;
}

const ExclamationTriangleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
);

const DeviceSecurityBanner: React.FC<DeviceSecurityBannerProps> = ({ profile }) => {
    const { jailbreak_flag, emulator_flag } = profile;

    if (!jailbreak_flag && !emulator_flag) {
        return null;
    }

    let message = '';
    if (jailbreak_flag && emulator_flag) {
        message = 'This device is flagged as rooted/jailbroken and is running in an emulator.';
    } else if (jailbreak_flag) {
        message = 'This device is flagged as rooted or jailbroken.';
    } else if (emulator_flag) {
        message = 'Running on an emulator is not permitted.';
    }

    return (
        <div className="p-4 rounded-md bg-red-100 dark:bg-red-900/40 border border-red-400 dark:border-red-800">
            <div className="flex">
                <div className="flex-shrink-0 text-red-600 dark:text-red-300">
                   <ExclamationTriangleIcon/>
                </div>
                <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800 dark:text-red-200">Security Alert</h3>
                    <div className="mt-2 text-sm text-red-700 dark:text-red-300">
                        <p>{message} All clock-in/out functions have been disabled for security reasons.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DeviceSecurityBanner;