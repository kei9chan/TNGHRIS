import React, { useState, useMemo } from 'react';
import { EnvelopeEvent, EnvelopeEventType } from '../../types';

interface EnvelopeTimelineProps {
    events: EnvelopeEvent[];
}

type FilterType = 'All' | 'Status' | 'Signatures' | 'Comments';

const EnvelopeTimeline: React.FC<EnvelopeTimelineProps> = ({ events }) => {
    const [filter, setFilter] = useState<FilterType>('All');

    const sortedEvents = useMemo(() => 
        [...events].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [events]);

    const filteredEvents = useMemo(() => {
        if (filter === 'All') return sortedEvents;
        if (filter === 'Status') {
            return sortedEvents.filter(e => [EnvelopeEventType.Created, EnvelopeEventType.Sent, EnvelopeEventType.Completed].includes(e.type));
        }
        if (filter === 'Signatures') {
            return sortedEvents.filter(e => [EnvelopeEventType.Signed, EnvelopeEventType.Approved, EnvelopeEventType.Declined].includes(e.type));
        }
        if (filter === 'Comments') {
            return sortedEvents.filter(e => e.type === EnvelopeEventType.CommentAdded);
        }
        return sortedEvents;
    }, [sortedEvents, filter]);

    const FilterButton: React.FC<{type: FilterType}> = ({ type }) => (
        <button 
            onClick={() => setFilter(type)}
            className={`px-2 py-1 text-xs rounded-md ${filter === type ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200'}`}
        >
            {type}
        </button>
    );

    return (
        <div>
            <div className="flex space-x-2 mb-4">
                <FilterButton type="All" />
                <FilterButton type="Status" />
                <FilterButton type="Signatures" />
                <FilterButton type="Comments" />
            </div>
            <ol className="relative border-l border-gray-200 dark:border-gray-700 max-h-80 overflow-y-auto pr-2">                  
                {filteredEvents.map((event, index) => (
                    <li key={index} className="mb-6 ml-4">
                        <div className="absolute w-3 h-3 bg-gray-200 rounded-full mt-1.5 -left-1.5 border border-white dark:border-gray-900 dark:bg-gray-700"></div>
                        <time className="mb-1 text-sm font-normal leading-none text-gray-400 dark:text-gray-500">{new Date(event.timestamp).toLocaleString()}</time>
                        <h3 className="text-base font-semibold text-gray-900 dark:text-white">{event.type} {event.userName}</h3>
                        {event.details && <p className="text-sm font-normal text-gray-500 dark:text-gray-400 italic">"{event.details}"</p>}
                    </li>
                ))}
                {filteredEvents.length === 0 && (
                    <p className="ml-4 text-sm text-gray-500">No events for this filter.</p>
                )}
            </ol>
        </div>
    );
};

export default EnvelopeTimeline;