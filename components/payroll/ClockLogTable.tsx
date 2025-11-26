

import React, { useState } from 'react';
import { TimeEvent, AnomalyTag } from '../../types';
import { mockUsers, mockSites } from '../../services/mockData';
import Modal from '../ui/Modal';

interface ClockLogTableProps {
    events: TimeEvent[];
}

const AnomalyChip: React.FC<{ tag: AnomalyTag }> = ({ tag }) => {
// FIX: Added missing AnomalyTag types to the styles map to ensure all tags can be rendered.
    const styles: { [key in AnomalyTag]: string } = {
        [AnomalyTag.LateIn]: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
        [AnomalyTag.Manual]: 'bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-200',
        [AnomalyTag.OutsideFence]: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
        [AnomalyTag.DeviceChange]: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
        [AnomalyTag.FailedLiveness]: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
        [AnomalyTag.ExpiredQR]: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
        [AnomalyTag.AutoClosed]: 'bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-200',
        [AnomalyTag.EarlyOut]: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
        [AnomalyTag.LateOut]: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
        [AnomalyTag.MissingIn]: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    };
    return (
        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[tag]}`}>
            {tag.replace('_', ' ')}
        </span>
    );
};

const ClockLogTable: React.FC<ClockLogTableProps> = ({ events }) => {
    const [selectedEvent, setSelectedEvent] = useState<TimeEvent | null>(null);

    const getUserName = (id: string) => mockUsers.find(u => u.id === id)?.name || 'Unknown';
    const getSiteName = (id: string) => mockSites.find(s => s.id === id)?.name || id;

    return (
        <>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date & Time</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Employee</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Method</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Site</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Anomalies</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {events.map(event => (
                            <tr key={event.id} onClick={() => setSelectedEvent(event)} className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(event.timestamp).toLocaleString()}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{getUserName(event.employeeId)}</td>
                                 <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${event.type === 'CLOCK_IN' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                        {event.type.replace('_', ' ')}
                                    </span>
                                 </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{event.source}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{getSiteName(event.locationId)}</td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex flex-wrap gap-1">
                                        {event.extra.anomaly_tags.map(tag => <AnomalyChip key={tag} tag={tag} />)}
                                    </div>
                                </td>
                            </tr>
                        ))}
                         {events.length === 0 && (
                            <tr>
                                <td colSpan={6} className="text-center py-10 text-gray-500 dark:text-gray-400">
                                    No clock events found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            {selectedEvent && (
                 <Modal isOpen={!!selectedEvent} onClose={() => setSelectedEvent(null)} title={`Event Details: ${selectedEvent.id}`}>
                    <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-md text-sm text-gray-800 dark:text-gray-200 overflow-x-auto">
                        {JSON.stringify(selectedEvent.extra, null, 2)}
                    </pre>
                </Modal>
            )}
        </>
    );
};

export default ClockLogTable;