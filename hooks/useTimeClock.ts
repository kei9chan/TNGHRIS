
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from './useAuth';
import { mockTimeEvents, mockShiftAssignments } from '../services/mockData';
import { TimeEvent, TimeEventType, ShiftAssignment, TimeEventExtra, AnomalyTag, TimeEventSource } from '../types';
import { getAppVersion } from '../services/deviceSecurity';

// Helper for exponential backoff retry logic
async function retryWithBackoff<T>(
    operation: () => Promise<T>,
    { retries = 3, delay = 500, onRetry }: { retries?: number, delay?: number, onRetry?: (attempt: number) => void } = {}
): Promise<T> {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (attempt === retries) {
                throw error;
            }
            if (onRetry) {
                onRetry(attempt);
            }
            const backoffDelay = delay * Math.pow(2, attempt - 1);
            console.log(`Attempt ${attempt} failed. Retrying in ${backoffDelay}ms...`);
            await new Promise(res => setTimeout(res, backoffDelay));
        }
    }
    // This line should not be reachable, but typescript needs it for a valid return path.
    throw new Error("Retry failed after all attempts.");
}

export class DebounceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DebounceError';
  }
}


export const useTimeClock = (simulateFailures: boolean = false) => {
    const { user } = useAuth();
    const [lastEvent, setLastEvent] = useState<TimeEvent | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRetrying, setIsRetrying] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const [eventCount, setEventCount] = useState(mockTimeEvents.length); // To trigger rerenders

    const userEvents = useMemo(() => {
        if (!user) return [];
        return mockTimeEvents
            .filter(e => e.employeeId === user.id)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, eventCount]);


    useEffect(() => {
        if (user) {
            setLastEvent(userEvents[0] || null);
        }
        setIsLoading(false);
    }, [user, userEvents]);

    const clockInStatus: 'in' | 'out' = useMemo(() => {
        if (!lastEvent) return 'out';
        return lastEvent.type === TimeEventType.ClockIn ? 'in' : 'out';
    }, [lastEvent]);
    
    const todaysShift = useMemo<ShiftAssignment | undefined>(() => {
        if (!user) return undefined;
        return mockShiftAssignments.find(sa => 
            sa.employeeId === user.id && 
            new Date(sa.date).toDateString() === new Date().toDateString()
        );
    }, [user]);

    const addTimeEvent = async (newEventData: Omit<TimeEvent, 'id' | 'employeeId'>) => {
        if (!user) throw new Error("User not found");

        const finalExtra = { ...newEventData.extra };
        const previousEvent = userEvents[0];
        const now = new Date();
        
        // 1. Debounce check: Prevent duplicate events within 2 minutes
        if (previousEvent) {
            const timeDiff = now.getTime() - new Date(previousEvent.timestamp).getTime();
            if (previousEvent.type === newEventData.type && timeDiff < 2 * 60 * 1000) {
                 throw new DebounceError(`Duplicate ${newEventData.type} event detected within 2 minutes.`);
            }
        }
        
        // 2. Clock-out without Clock-in check
        if (newEventData.type === TimeEventType.ClockOut && clockInStatus === 'out') {
            finalExtra.anomaly_tags.push(AnomalyTag.MissingIn);
        }

        if (previousEvent && previousEvent.extra.deviceId !== finalExtra.deviceId) {
            finalExtra.anomaly_tags.push(AnomalyTag.DeviceChange);
        }

        const eventToAdd: TimeEvent = {
            ...newEventData,
            timestamp: now,
            extra: finalExtra,
            id: `TE-${Date.now()}`,
            employeeId: user.id,
        };
        
        const operation = () => new Promise<void>((resolve, reject) => {
             setTimeout(() => {
                // Simulate a 50% chance of network failure if toggled
                if (simulateFailures && Math.random() < 0.5) {
                    console.error("Simulated network failure.");
                    reject(new Error("Network error"));
                } else {
                    mockTimeEvents.push(eventToAdd);
                    setEventCount(mockTimeEvents.length); // Trigger re-render
                    setLastEvent(eventToAdd);
                    resolve();
                }
            }, 300); // Simulate P99 < 400ms
        });
        
        try {
            await retryWithBackoff(operation, {
                onRetry: (attempt) => {
                    setIsRetrying(true);
                    setRetryCount(attempt);
                }
            });
        } finally {
            setIsRetrying(false);
            setRetryCount(0);
        }
    };
    
    // New Function for Batch Processing
    const addBatchTimeEvents = async (events: TimeEvent[]) => {
        // In a real app, this would post to a batch endpoint
        const operation = () => new Promise<void>((resolve) => {
            setTimeout(() => {
                mockTimeEvents.push(...events);
                setEventCount(mockTimeEvents.length);
                resolve();
            }, 800); // Simulating longer processing time
        });
        
         await operation();
    };
    
    const autoCloseStaleShifts = (staleAfterHours: number): number => {
        const now = new Date();
        const staleThreshold = now.getTime() - staleAfterHours * 60 * 60 * 1000;
        
        const lastEventMap = new Map<string, TimeEvent>();
        for (const event of mockTimeEvents) {
            lastEventMap.set(event.employeeId, event);
        }

        let closedCount = 0;
        lastEventMap.forEach((lastEvent, employeeId) => {
            if (lastEvent.type === TimeEventType.ClockIn && new Date(lastEvent.timestamp).getTime() < staleThreshold) {
                const autoClockOutTime = new Date(lastEvent.timestamp);
                autoClockOutTime.setHours(autoClockOutTime.getHours() + 8);

                const extra: TimeEventExtra = {
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    app_version: getAppVersion(),
                    ip_hash: 'SYSTEM',
                    site_name: 'SYSTEM_CLOSED',
                    anomaly_tags: [AnomalyTag.AutoClosed],
                    platform: 'system',
                    jailbreak_flag: false,
                    emulator_flag: false,
                    deviceId: 'SYSTEM'
                };
                
                const autoClockOutEvent: TimeEvent = {
                    id: `TE-AUTO-${Date.now()}-${employeeId}`,
                    employeeId: employeeId,
                    timestamp: autoClockOutTime,
                    type: TimeEventType.ClockOut,
                    source: TimeEventSource.System,
                    locationId: lastEvent.locationId,
                    extra,
                };
                mockTimeEvents.push(autoClockOutEvent);
                closedCount++;
            }
        });

        if (closedCount > 0) {
            setEventCount(mockTimeEvents.length); // Trigger re-render
        }
        return closedCount;
    };

    return { isLoading, clockInStatus, lastEvent, todaysShift, addTimeEvent, addBatchTimeEvents, isRetrying, retryCount, autoCloseStaleShifts };
};
