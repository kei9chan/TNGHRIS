import React, { useState, useMemo } from 'react';
import { mockTimeEvents, mockUsers, mockSites } from '../../services/mockData';
import { TimeEvent, TimeEventSource, AnomalyTag } from '../../types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import ClockLogTable from '../../components/payroll/ClockLogTable';

const ClockLog: React.FC = () => {
    const [filters, setFilters] = useState({
        startDate: '',
        endDate: '',
        employeeId: '',
        siteId: '',
        method: '',
        anomaly: '',
    });

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const filteredEvents = useMemo(() => {
        return mockTimeEvents.filter(event => {
            const eventDate = new Date(event.timestamp);
            if (filters.startDate && eventDate < new Date(filters.startDate)) return false;
            if (filters.endDate) {
                const endOfDay = new Date(filters.endDate);
                endOfDay.setHours(23, 59, 59, 999);
                if (eventDate > endOfDay) return false;
            }
            if (filters.employeeId && event.employeeId !== filters.employeeId) return false;
            if (filters.siteId && event.locationId !== filters.siteId) return false;
            if (filters.method && event.source !== filters.method) return false;
            if (filters.anomaly && !event.extra.anomaly_tags.includes(filters.anomaly as AnomalyTag)) return false;
            return true;
        }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [filters]);

    const exportToCSV = () => {
        const dataToExport = filteredEvents.slice(0, 10000);
        const headers = ['Date and Time', 'Employee Code', 'Employee Name', 'Method', 'Site', 'Anomaly Tags', 'Timezone', 'App Version', 'IP Hash'];
        
        const csvRows = [headers.join(',')];

        for (const event of dataToExport) {
            const user = mockUsers.find(u => u.id === event.employeeId);
            const values = [
                `"${new Date(event.timestamp).toLocaleString()}"`,
                event.employeeId,
                user?.name || 'N/A',
                event.source,
                event.extra.site_name,
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
                <Button onClick={exportToCSV} disabled={filteredEvents.length === 0}>
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
                            {mockUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="siteId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Site</label>
                        <select name="siteId" id="siteId" value={filters.siteId} onChange={handleFilterChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                            <option value="">All</option>
                            {mockSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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
                <ClockLogTable events={filteredEvents} />
            </Card>
        </div>
    );
};

export default ClockLog;