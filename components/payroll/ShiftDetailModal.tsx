import React from 'react';
import { ShiftAssignment, User, ShiftTemplate, ShiftRotationTemplate } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

export interface EnrichedAssignmentDetail {
    assignment: ShiftAssignment;
    employee: User;
    shift: ShiftTemplate;
    rotation?: ShiftRotationTemplate;
}

interface ShiftDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    onDelete: (assignmentId: string) => void;
    onCopyWeek: (assignment: ShiftAssignment) => void;
    onChangeShift: () => void;
    assignmentDetail: EnrichedAssignmentDetail | null;
    isEditable: boolean;
}

const DetailItem: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div>
        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{children}</dd>
    </div>
);

const ShiftDetailModal: React.FC<ShiftDetailModalProps> = ({ isOpen, onClose, onDelete, onCopyWeek, assignmentDetail, onChangeShift, isEditable }) => {
    if (!assignmentDetail) return null;

    const { assignment, employee, shift, rotation } = assignmentDetail;

    const handleDelete = () => {
        onDelete(assignment.id);
    };

    const handleCopy = () => {
        onCopyWeek(assignment);
    };

    const footer = (
        <div className="flex justify-between items-center w-full">
            <div>
                {isEditable && <Button variant="danger" onClick={handleDelete}>Delete Shift</Button>}
            </div>
            <div className="flex space-x-2">
                {isEditable && <Button variant="secondary" onClick={handleCopy}>Copy to Rest of Week</Button>}
                {isEditable && <Button variant="secondary" onClick={onChangeShift}>Change Shift</Button>}
                <Button variant="secondary" onClick={onClose}>Close</Button>
            </div>
        </div>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Shift Details for ${employee.name}`}
            footer={footer}
        >
            <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                <DetailItem label="Employee">{employee.name}</DetailItem>
                <DetailItem label="Date">{new Date(assignment.date).toLocaleDateString()}</DetailItem>
                <DetailItem label="Shift">{shift.name}</DetailItem>
                <DetailItem label="Time">{shift.startTime} - {shift.endTime}</DetailItem>
                <div className="sm:col-span-2">
                    <DetailItem label="Source of Assignment">
                        {rotation ? (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300">
                                Shift Rotation ('{rotation.name}')
                            </span>
                        ) : (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                                Manual Assignment
                            </span>
                        )}
                    </DetailItem>
                </div>
            </dl>
        </Modal>
    );
};

export default ShiftDetailModal;