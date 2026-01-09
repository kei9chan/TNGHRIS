import React, { useState, useEffect } from 'react';
import { TimeEvent, TimeEventSource, AnomalyTag, Permission } from '../../types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import ClockLogTable from '../../components/payroll/ClockLogTable';
import { supabase } from '../../services/supabaseClient';
import { usePermissions } from '../../hooks/usePermissions';

const ClockLog: React.FC = () => {
    const { can, getVisibleEmployeeIds } = usePermissions();
    const canView = can('ClockLog', Permission.View);
    const canManage = can('ClockLog', Permission.Manage);
    const [filters, setFilters] = useState({
        startDate: '',
        endDate: '',
        employeeId: '',
        siteId: '',
        method: '',
        anomaly: '',
    });
    const [events, setEvents] = useState<TimeEvent[]>([]);
    const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
    const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const mapTypeFromDb = (type?: string): TimeEvent['type'] => {
        const t = (type || '').toLowerCase();
        if (t.includes('out')) return 'CLOCK_OUT' as TimeEvent['type'];
        if (t.includes('start')) return 'START_BREAK' as TimeEvent['type'];
        if (t.includes('end')) return 'END_BREAK' as TimeEvent['type'];
        return 'CLOCK_IN' as TimeEvent['type'];
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

    const mapSourceToDb = (source?: string) => {
        const s = (source || '').toString();
        switch (s) {
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
            case TimeEventSource.Mobile:
            case TimeEventSource.GPS:
            default:
                return 'MobileGPS';
        }
    };

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const loadLookups = async () => {
        const [{ data: empData }, { data: siteData }] = await Promise.all([
            supabase.from('hris_users').select('id, full_name').order('full_name'),
            supabase.from('sites').select('id, name').order('name'),
        ]);
        setEmployees((empData || []).map((e: any) => ({ id: e.id, name: e.full_name || 'Unknown' })));
        setSites((siteData || []).map((s: any) => ({ id: s.id, name: s.name || 'Unknown' })));
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

    const fetchEvents = async () => {
        if (!canView) {
            setEvents([]);
            return;
        }
        setIsLoading(true);
        let query = supabase.from('time_events').select('*').order('timestamp', { ascending: false }).limit(2000);

        if (filters.employeeId) query = query.eq('employee_id', filters.employeeId);
        if (filters.siteId) query = query.eq('location_id', filters.siteId);
        if (filters.method) query = query.eq('source', mapSourceToDb(filters.method));
        if (filters.anomaly) query = query.contains('anomaly_tags', [filters.anomaly]);
        if (filters.startDate) query = query.gte('timestamp', filters.startDate);
        if (filters.endDate) {
            const endOfDay = new Date(filters.endDate);
            endOfDay.setHours(23, 59, 59, 999);
            query = query.lte('timestamp', endOfDay.toISOString());
        }
        const visibleIds = getVisibleEmployeeIds();
        if (!canManage) {
            if (!visibleIds.length) {
                setEvents([]);
                setIsLoading(false);
                return;
            }
            query = query.in('employee_id', visibleIds);
        }

        const { data, error } = await query;
        if (error) {
            console.error('Failed to load events', error);
            setEvents([]);
        } else {
            setEvents((data || []).map(mapRowToEvent));
        }
        setIsLoading(false);
    };

    useEffect(() => {
        loadLookups();
    }, []);

    useEffect(() => {
        fetchEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters]);

    if (!canView) {
        return (
            <div className="p-6">
                <Card>
                    <div className="p-6 text-center text-gray-600 dark:text-gray-300">
                        You do not have permission to view Clock Log.
                    </div>
                </Card>
            </div>
        );
    }

    const visibleIds = getVisibleEmployeeIds();
    const employeeOptions = canManage ? employees : employees.filter(e => visibleIds.includes(e.id));

    const exportToCSV = () => {
        const dataToExport = events.slice(0, 10000);
        const headers = ['Date and Time', 'Employee Code', 'Employee Name', 'Method', 'Site', 'Anomaly Tags', 'Timezone', 'App Version', 'IP Hash'];
        
        const csvRows = [headers.join(',')];

        for (const event of dataToExport) {
            const values = [
                `"${new Date(event.timestamp).toLocaleString()}"`,
                event.employeeId,
                employees.find(u => u.id === event.employeeId)?.name || 'N/A',
                event.source,
                event.extra.site_name || sites.find(s => s.id === event.locationId)?.name || 'N/A',
                `"${event.extra.anomaly_tags.join('; ')}"`,
                event.extra.timezone,
                event.extra.app_version,
                event.extra.ip_hash,
            ];
            csvRows.push(values.join(','));
        }

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', `clock_log_export_${new Date().toISOString()}.csv`);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Clock Event Log</h1>
                <Button onClick={exportToCSV} disabled={events.length === 0}>
                    Export to CSV (Max 10k rows)
                </Button>
            </div>

            <Card>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 p-4">
                    <Input label="Start Date" type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} />
                    <Input label="End Date" type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} />
                    <div>
                        <label htmlFor="employeeId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Employee</label>
                        <select name="employeeId" id="employeeId" value={filters.employeeId} onChange={handleFilterChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option value="">All</option>
                            {employeeOptions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="siteId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Site</label>
                        <select name="siteId" id="siteId" value={filters.siteId} onChange={handleFilterChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option value="">All</option>
                            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="method" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Method</label>
                        <select name="method" id="method" value={filters.method} onChange={handleFilterChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option value="">All</option>
                            {Object.values(TimeEventSource).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                     <div>
                        <label htmlFor="anomaly" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Anomaly</label>
                        <select name="anomaly" id="anomaly" value={filters.anomaly} onChange={handleFilterChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option value="">Any</option>
                             {Object.values(AnomalyTag).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                </div>
            </Card>

            <Card>
                <ClockLogTable 
                    events={events} 
                    getEmployeeName={(id) => employees.find(e => e.id === id)?.name || 'Unknown'} 
                    getSiteName={(id, fallback) => fallback || sites.find(s => s.id === id)?.name || id} 
                />
                {isLoading && <div className="p-4 text-sm text-gray-500">Loading events…</div>}
            </Card>
        </div>
    );
};

export default ClockLog;
