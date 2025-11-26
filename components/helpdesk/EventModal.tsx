import React, { useState, useEffect } from 'react';
import { CalendarEvent } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: Partial<CalendarEvent> | null;
  onSave: (event: CalendarEvent) => void;
  onDelete: (eventId: string) => void;
  isReadOnly?: boolean;
}

const colors: CalendarEvent['color'][] = ['blue', 'green', 'red', 'yellow', 'purple'];

const EventModal: React.FC<EventModalProps> = ({ isOpen, onClose, event, onSave, onDelete, isReadOnly = false }) => {
  const [current, setCurrent] = useState<Partial<CalendarEvent>>(event || {});

  useEffect(() => {
    if (isOpen) {
      setCurrent(event || { color: 'blue', start: new Date(), end: new Date() });
    }
  }, [event, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCurrent(prev => ({ ...prev, [name]: value }));
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = new Date(e.target.value);
    const start = new Date(current.start || 0);
    const end = new Date(current.end || 0);
    start.setFullYear(newDate.getFullYear(), newDate.getMonth(), newDate.getDate());
    end.setFullYear(newDate.getFullYear(), newDate.getMonth(), newDate.getDate());
    setCurrent(prev => ({ ...prev, start, end }));
  };
  
  const handleTimeChange = (field: 'start' | 'end', time: string) => {
    const date = new Date(current[field] || 0);
    const [hours, minutes] = time.split(':').map(Number);
    date.setHours(hours, minutes);
    setCurrent(prev => ({ ...prev, [field]: date }));
  };

  const handleSave = () => {
    if (current.title?.trim()) {
      onSave(current as CalendarEvent);
    }
  };
  
  const formatDate = (date?: Date) => date ? new Date(date).toISOString().split('T')[0] : '';
  const formatTime = (date?: Date) => date ? new Date(date).toTimeString().substring(0, 5) : '';

  const footer = (
    <div className={`flex w-full ${current.id && !isReadOnly ? 'justify-between' : 'justify-end'}`}>
      <div>
        {current.id && !isReadOnly && <Button variant="danger" onClick={() => onDelete(current.id!)}>Delete</Button>}
      </div>
      <div className="flex space-x-2 items-center">
        {isReadOnly && <span className="text-sm text-gray-500 italic">Birthdays are managed on employee profiles.</span>}
        <Button variant="secondary" onClick={onClose}>Close</Button>
        {!isReadOnly && <Button onClick={handleSave}>{current.id ? 'Save Changes' : 'Create Event'}</Button>}
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={event?.id ? 'Edit Event' : 'New Event'}
      footer={footer}
    >
      <div className="space-y-4">
        <Input label="Event Title" name="title" value={current.title || ''} onChange={handleChange} required autoFocus disabled={isReadOnly} />
        <Input label="Date" type="date" value={formatDate(current.start)} onChange={handleDateChange} disabled={isReadOnly}/>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Start Time" type="time" value={formatTime(current.start)} onChange={e => handleTimeChange('start', e.target.value)} disabled={isReadOnly}/>
          <Input label="End Time" type="time" value={formatTime(current.end)} onChange={e => handleTimeChange('end', e.target.value)} disabled={isReadOnly}/>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Color Tag</label>
          <div className="mt-2 flex space-x-2">
            {colors.map(color => (
              <button
                key={color}
                type="button"
                onClick={() => setCurrent(prev => ({...prev, color}))}
                className={`w-8 h-8 rounded-full bg-${color}-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-${color}-500 ${current.color === color ? 'ring-2 ring-offset-2 ring-indigo-500' : ''} ${isReadOnly ? 'cursor-not-allowed' : ''}`}
                aria-label={color}
                disabled={isReadOnly}
              ></button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default EventModal;
