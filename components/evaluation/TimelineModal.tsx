import React, { useState, useEffect } from 'react';
import { EvaluationTimeline, TimelineStatus } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';

interface TimelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  timeline: EvaluationTimeline | null;
  onSave: (timeline: EvaluationTimeline) => void;
}

const timelineTypes = ['Quarterly', 'Onboarding', 'Annual', 'Custom'];

const TimelineModal: React.FC<TimelineModalProps> = ({ isOpen, onClose, timeline, onSave }) => {
  const [current, setCurrent] = useState<Partial<EvaluationTimeline>>(timeline || {});

  useEffect(() => {
    setCurrent(timeline || {
        name: '',
        type: 'Quarterly',
        rolloutDate: new Date(),
        endDate: new Date(),
        status: TimelineStatus.Draft,
    });
  }, [timeline, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setCurrent(prev => ({
      ...prev,
      [name]: name.includes('Date') ? new Date(value) : value
    }));
  };

  const handleSave = () => {
    if (current.name && current.rolloutDate && current.endDate) {
      onSave(current as EvaluationTimeline);
    }
  };
  
  const formatDateForInput = (date?: Date) => {
    if (!date) return '';
    return new Date(date).toISOString().split('T')[0];
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={timeline ? 'Edit Timeline' : 'Create New Timeline'}
      footer={
        <div className="flex justify-end w-full space-x-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>{timeline ? 'Save Changes' : 'Create Timeline'}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input label="Timeline Name" id="name" name="name" value={current.name || ''} onChange={handleChange} required />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label htmlFor="type" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Type</label>
                <select id="type" name="type" value={current.type || ''} onChange={handleChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    {timelineTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
            </div>
             <div>
                <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                <select id="status" name="status" value={current.status || ''} onChange={handleChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    {Object.values(TimelineStatus).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Rollout Date" id="rolloutDate" name="rolloutDate" type="date" value={formatDateForInput(current.rolloutDate)} onChange={handleChange} required />
            <Input label="End Date" id="endDate" name="endDate" type="date" value={formatDateForInput(current.endDate)} onChange={handleChange} required />
        </div>
      </div>
    </Modal>
  );
};

export default TimelineModal;
