
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from './useAuth';
import { mockShiftAssignments } from '../services/mockData';
import { TimeEvent, TimeEventType, ShiftAssignment, TimeEventExtra, AnomalyTag, TimeEventSource } from '../types';
import { getAppVersion } from '../services/deviceSecurity';
import { supabase } from '../services/supabaseClient';

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

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const mapTypeToDb = (type: TimeEventType) => {
    switch (type) {
        case TimeEventType.ClockIn:
            return 'ClockIn';
        case TimeEventType.ClockOut:
            return 'ClockOut';
        case TimeEventType.StartBreak:
            return 'BreakStart';
        case TimeEventType.EndBreak:
            return 'BreakEnd';
        default:
            return 'ClockIn';
    }
};

const mapTypeFromDb = (type?: string): TimeEventType => {
    const t = (type || '').toLowerCase();
    if (t.includes('out')) return TimeEventType.ClockOut;
    if (t.includes('start')) return TimeEventType.StartBreak;
    if (t.includes('end')) return TimeEventType.EndBreak;
    return TimeEventType.ClockIn;
};

const mapSourceToDb = (source: TimeEventSource) => {
    switch (source) {
        case TimeEventSource.QR:
            return 'QRKiosk';
        case TimeEventSource.Photo:
            return 'WebPhoto';
        case TimeEventSource.Biometric:
            return 'Biometrics';
        case TimeEventSource.Manual:
            return 'Manual';
        case TimeEventSource.System:
            return 'System';
        case TimeEventSource.GPS:
        case TimeEventSource.Mobile:
        default:
            return 'MobileGPS';
    }
};

const mapSourceFromDb = (source?: string): TimeEventSource => {
    const s = (source || '').toLowerCase();
    if (s.includes('qr')) return TimeEventSource.QR;
    if (s.includes('photo')) return TimeEventSource.Photo;
    if (s.includes('bio')) return TimeEventSource.Biometric;
    if (s.includes('manual')) return TimeEventSource.Manual;
    if (s.includes('system')) return TimeEventSource.System;
    if (s.includes('mobile')) return TimeEventSource.Mobile;
    return TimeEventSource.GPS;
};

const mapRowToEvent = (row: any): TimeEvent => ({
    id: row.id,
    employeeId: row.employee_id,
    timestamp: new Date(row.timestamp),
    type: mapTypeFromDb(row.type),
    source: mapSourceFromDb(row.source),
    locationId: row.location_id || '',
    extra: {
        timezone: row.timezone || '',
        app_version: row.app_version || '',
        ip_hash: row.ip_hash || '',
        site_name: row.site_name || '',
        anomaly_tags: row.anomaly_tags || [],
        platform: row.platform || '',
        jailbreak_flag: !!row.jailbreak_flag,
        emulator_flag: !!row.emulator_flag,
        deviceId: row.device_id || '',
    }
});

export const useTimeClock = (simulateFailures: boolean = false) => {
    const { user } = useAuth();
    const [lastEvent, setLastEvent] = useState<TimeEvent | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRetrying, setIsRetrying] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const [todaysShift, setTodaysShift] = useState<ShiftAssignment | undefined>(undefined);

    const loadLastEvent = async () => {
        if (!user) return;
        const { data, error } = await supabase
            .from('time_events')
            .select('*')
            .eq('employee_id', user.id)
            .order('timestamp', { ascending: false })
            .limit(1);
        if (!error && data && data.length > 0) {
            setLastEvent(mapRowToEvent(data[0]));
        } else {
            setLastEvent(null);
        }
    };

    const loadTodaysShift = async () => {
        if (!user) return;
        const todayIso = new Date().toISOString().slice(0, 10);
        const { data } = await supabase
            .from('shift_assignments')
            .select('*')
            .eq('employee_id', user.id)
            .eq('date', todayIso)
            .order('date', { ascending: false })
            .limit(1);

        if (data && data.length > 0) {
            const row = data[0];
            setTodaysShift({
                id: row.id,
                employeeId: row.employee_id,
                shiftTemplateId: row.shift_template_id || '',
                date: new Date(row.date),
                locationId: row.site_id || '',
                assignedAreaId: row.assigned_area_id,
            } as ShiftAssignment);
        } else {
            const fallback = mockShiftAssignments.find(sa =>
                sa.employeeId === user?.id &&
                new Date(sa.date).toDateString() === new Date().toDateString()
            );
            setTodaysShift(fallback);
        }
    };


    useEffect(() => {
        (async () => {
            setIsLoading(true);
            await Promise.all([loadLastEvent(), loadTodaysShift()]);
            setIsLoading(false);
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const clockInStatus: 'in' | 'out' = useMemo(() => {
        if (!lastEvent) return 'out';
        return lastEvent.type === TimeEventType.ClockIn ? 'in' : 'out';
    }, [lastEvent]);

    const addTimeEvent = async (newEventData: Omit<TimeEvent, 'id' | 'employeeId'>) => {
        if (!user) throw new Error("User not found");

        const finalExtra: TimeEventExtra = { ...newEventData.extra, anomaly_tags: newEventData.extra.anomaly_tags || [] };
        const previousEvent = lastEvent;
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

        const payload = {
            employee_id: user.id,
            timestamp: now.toISOString(),
            type: mapTypeToDb(newEventData.type),
            source: mapSourceToDb(newEventData.source),
            location_id: newEventData.locationId && uuidRegex.test(newEventData.locationId) ? newEventData.locationId : null,
            site_name: finalExtra.site_name || null,
            timezone: finalExtra.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
            anomaly_tags: finalExtra.anomaly_tags || [],
            app_version: finalExtra.app_version || getAppVersion(),
            ip_hash: finalExtra.ip_hash || '',
            device_id: finalExtra.deviceId || '',
            platform: finalExtra.platform || '',
            jailbreak_flag: finalExtra.jailbreak_flag ?? false,
            emulator_flag: finalExtra.emulator_flag ?? false,
            notes: finalExtra.note || null,
        };

        const operation = async () => {
            const { data, error } = await supabase
                .from('time_events')
                .insert(payload)
                .select('*')
                .single();
            if (error) throw error;
            if (data) {
                const mapped = mapRowToEvent(data);
                setLastEvent(mapped);
            }
        };
        
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
        if (!events.length) return;
        const payload = events.map(ev => ({
            employee_id: ev.employeeId,
            timestamp: ev.timestamp instanceof Date ? ev.timestamp.toISOString() : ev.timestamp,
            type: mapTypeToDb(ev.type),
            source: mapSourceToDb(ev.source),
            location_id: ev.locationId && uuidRegex.test(ev.locationId) ? ev.locationId : null,
            site_name: ev.extra?.site_name || null,
            timezone: ev.extra?.timezone || null,
            anomaly_tags: ev.extra?.anomaly_tags || [],
            app_version: ev.extra?.app_version || null,
            ip_hash: ev.extra?.ip_hash || null,
            device_id: ev.extra?.deviceId || null,
            platform: ev.extra?.platform || null,
            jailbreak_flag: ev.extra?.jailbreak_flag ?? false,
            emulator_flag: ev.extra?.emulator_flag ?? false,
            notes: ev.extra?.note || null,
        }));
        await supabase.from('time_events').insert(payload);
        await loadLastEvent();
    };
    
    const autoCloseStaleShifts = async (staleAfterHours: number): Promise<number> => {
        if (!user || !lastEvent) return 0;
        const staleThreshold = Date.now() - staleAfterHours * 60 * 60 * 1000;
        if (lastEvent.type !== TimeEventType.ClockIn || new Date(lastEvent.timestamp).getTime() >= staleThreshold) {
            return 0;
        }

        const autoClockOutTime = new Date(lastEvent.timestamp);
        autoClockOutTime.setHours(autoClockOutTime.getHours() + 8);

        const extra: TimeEventExtra = {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            app_version: getAppVersion(),
            ip_hash: 'SYSTEM',
            site_name: lastEvent.extra?.site_name || 'SYSTEM_CLOSED',
            anomaly_tags: [AnomalyTag.AutoClosed],
            platform: 'system',
            jailbreak_flag: false,
            emulator_flag: false,
            deviceId: 'SYSTEM'
        };

        await supabase.from('time_events').insert({
            employee_id: user.id,
            timestamp: autoClockOutTime.toISOString(),
            type: 'ClockOut',
            source: 'System',
            location_id: lastEvent.locationId && uuidRegex.test(lastEvent.locationId) ? lastEvent.locationId : null,
            site_name: extra.site_name,
            timezone: extra.timezone,
            anomaly_tags: extra.anomaly_tags,
            app_version: extra.app_version,
            ip_hash: extra.ip_hash,
            device_id: extra.deviceId,
            platform: extra.platform,
            jailbreak_flag: extra.jailbreak_flag,
            emulator_flag: extra.emulator_flag,
            notes: null,
        });

        await loadLastEvent();
        return 1;
    };

    return { isLoading, clockInStatus, lastEvent, todaysShift, addTimeEvent, addBatchTimeEvents, isRetrying, retryCount, autoCloseStaleShifts };
};
