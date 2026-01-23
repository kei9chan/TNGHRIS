
import React, { useMemo, useState } from 'react';
import { ShiftTemplate, User, DayTypeTier } from '../../types';

interface Gap {
    date: Date;
    role: string;
    areaId: string;
    areaName: string;
    required: number;
    scheduled: number;
    missing: number;
    dayType: DayTypeTier;
    shiftTime?: { start: string; end: string };
}

interface ShiftAssignmentDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    employee: User | null;
    date: Date | null;
    templates: ShiftTemplate[];
    onSave: (employeeId: string, date: Date, templateId: string) => void;
    onCopyLastWeekSchedule: (employeeId: string) => void;
    gaps?: Gap[];
}

const XIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
);

const ClipboardCopyIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
);

const SparklesIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" /></svg>;

const ShiftAssignmentDrawer: React.FC<ShiftAssignmentDrawerProps> = ({ isOpen, onClose, employee, date, templates, onSave, onCopyLastWeekSchedule, gaps }) => {
    if (!employee || !date) return null;
    
    // Local state to override template selection when a gap recommendation is clicked
    const [highlightedTemplateId, setHighlightedTemplateId] = useState<string | null>(null);

    const relevantGaps = useMemo(() => {
        if (!gaps) return [];
        return gaps.filter(g => 
            new Date(g.date).toDateString() === date.toDateString() && 
            (!employee.position || employee.position === g.role) // Filter gaps relevant to this employee's role
        );
    }, [gaps, date, employee]);

    const handleCopyClick = () => {
        onCopyLastWeekSchedule(employee.id);
    };
    
    const handleGapClick = (gap: Gap) => {
        // Find template that matches gap time
        if (gap.shiftTime) {
            const match = templates.find(t => t.startTime === gap.shiftTime?.start && t.endTime === gap.shiftTime?.end);
            if (match) {
                setHighlightedTemplateId(match.id);
            }
        }
    };

    return (
        <>
            {/* Overlay */}
            <div
                className={`fixed inset-0 bg-black bg-opacity-50 z-[50] transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
                aria-hidden="true"
            ></div>
            {/* Drawer */}
            <div
                className={`fixed top-[128px] right-0 h-[calc(100%-128px)] w-80 bg-white dark:bg-slate-800 shadow-xl z-[60] transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
                role="dialog"
                aria-modal="true"
            >
                <div className="flex flex-col h-full">
                    <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-slate-700 shrink-0">
                        <div className="flex-grow">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Assign Shift</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                For <strong>{employee.name}</strong> on {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                            </p>
                        </div>
                        <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700">
                            <XIcon />
                        </button>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto p-2">
                        
                        {/* Recommendations Section */}
                        {relevantGaps.length > 0 && (
                            <div className="mb-4">
                                <h4 className="text-xs font-bold uppercase text-red-500 dark:text-red-400 mb-2 pl-2">⚠️ Unfilled Requirements</h4>
                                <div className="space-y-2">
                                    {relevantGaps.map((gap, idx) => (
                                        <div 
                                            key={idx} 
                                            onClick={() => handleGapClick(gap)}
                                            className="p-2 rounded bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800 cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                                        >
                                            <div className="flex items-center text-red-700 dark:text-red-300 font-medium text-sm">
                                                <SparklesIcon />
                                                <span>{gap.areaName} needs {gap.missing} more</span>
                                            </div>
                                            <p className="text-xs text-red-600 dark:text-red-400 pl-5">
                                                {gap.role} ({gap.shiftTime?.start} - {gap.shiftTime?.end})
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div>
                            <button
                                onClick={handleCopyClick}
                                className="w-full flex items-center justify-center px-4 py-2 text-sm rounded-md bg-blue-50 hover:bg-blue-100 dark:bg-slate-700 dark:hover:bg-slate-600 font-semibold text-blue-700 dark:text-blue-300 transition-colors"
                            >
                                <ClipboardCopyIcon />
                                Copy Last Week's Schedule
                            </button>
                        </div>
                        <div className="my-2 border-t border-gray-200 dark:border-gray-600"></div>
                        <ul className="space-y-1 pb-4">
                            {templates.map(template => {
                                const isHighlighted = highlightedTemplateId === template.id;
                                return (
                                    <li key={template.id}>
                                        <button
                                            onClick={() => onSave(employee.id, date, template.id)}
                                            className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors border ${
                                                isHighlighted 
                                                ? 'bg-indigo-100 border-indigo-500 ring-1 ring-indigo-500 dark:bg-indigo-900/60' 
                                                : 'border-transparent hover:bg-indigo-100 dark:hover:bg-indigo-900/50'
                                            }`}
                                        >
                                            <div className="flex justify-between items-center">
                                                <p className="font-medium">{template.name}</p>
                                                {isHighlighted && <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">Recommended</span>}
                                            </div>
                                            <p className="text-xs text-gray-500">{template.startTime} - {template.endTime}</p>
                                        </button>
                                    </li>
                                )
                            })}
                        </ul>
                    </div>
                </div>
            </div>
        </>
    );
};

export default ShiftAssignmentDrawer;
