import React from 'react';
import { ShiftAssignment } from '../../types';

interface ShiftActionPopoverProps {
    assignment: ShiftAssignment;
    onClose: () => void;
    onViewDetail: (assignment: ShiftAssignment) => void;
    onCopyWeek: (assignment: ShiftAssignment) => void;
    position: { top: number; left: number };
}

const ShiftActionPopover: React.FC<ShiftActionPopoverProps> = ({ assignment, onClose, onViewDetail, onCopyWeek, position }) => {
    
    return (
        <div
            className="fixed z-20 bg-white dark:bg-slate-800 shadow-lg rounded-md border dark:border-slate-700 text-sm font-medium"
            style={{ top: `${position.top}px`, left: `${position.left}px` }}
        >
            <ul className="divide-y divide-gray-200 dark:divide-slate-700">
                <li>
                    <button
                        onClick={() => onCopyWeek(assignment)}
                        className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors rounded-t-md"
                    >
                        Copy to Rest of Week
                    </button>
                </li>
                <li>
                    <button
                        onClick={() => onViewDetail(assignment)}
                        className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors rounded-b-md"
                    >
                        View/Delete Shift
                    </button>
                </li>
            </ul>
        </div>
    );
};

export default ShiftActionPopover;