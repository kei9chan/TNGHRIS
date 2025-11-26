import { DeviceSecurityProfile } from '../types';

const DEVICE_ID_KEY = 'tnghris-device-id';
const APP_VERSION = '1.0.0';

/**
 * Gets a stable device ID from localStorage, or generates and saves a new one.
 */
export const getDeviceId = (): string => {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
        deviceId = `web-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
        localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
};

/**
 * Clears the stored device ID, simulating a new device for testing.
 */
export const clearDeviceId = (): void => {
    localStorage.removeItem(DEVICE_ID_KEY);
};

/**
 * Simulates checking the device for security flags like root/jailbreak or emulators.
 * @param isRootedSimulation - A boolean to force a "rooted" state for testing.
 * @returns A profile with device security information.
 */
export const checkDeviceSecurity = (isRootedSimulation: boolean): DeviceSecurityProfile => {
    // In a real native app, you would use libraries to detect these states.
    // For web, this is a simulation.
    const isEmulator = /HeadlessChrome/.test(window.navigator.userAgent);

    return {
        platform: 'web',
        jailbreak_flag: isRootedSimulation,
        emulator_flag: isEmulator,
        deviceId: getDeviceId(),
    };
};

export const getAppVersion = (): string => {
    return APP_VERSION;
};