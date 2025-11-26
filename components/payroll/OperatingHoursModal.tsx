import React, { useState, useEffect } from 'react';
import { OperatingHours } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';

interface OperatingHoursModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newHours: OperatingHours['hours']) => void;
  currentHours: OperatingHours['hours'];
  businessUnitName?: string;
}

const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const OperatingHoursModal: React.FC<OperatingHoursModalProps> = ({ isOpen, onClose, onSave, currentHours, businessUnitName }) => {
  const [hours, setHours] = useState<OperatingHours['hours']>(currentHours);

  useEffect(() => {
    if (isOpen) {
      setHours(currentHours);
    }
  }, [currentHours, isOpen]);

  const handleChange = (day: string, type: 'open' | 'close', value: string) => {
    setHours(prev => ({
      ...prev,
      [day]: {
        ...(prev[day] || { open: '00:00', close: '00:00' }),
        [type]: value,
      },
    }));
  };

  const handleSave = () => {
    onSave(hours);
  };

  const footer = (
    <div className="flex justify-end w-full space-x-2">
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
      <Button onClick={handleSave}>Save Changes</Button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit Business Hours for ${businessUnitName || 'the Business Unit'}`} footer={footer}>
      <div className="space-y-4">
        {daysOfWeek.map(day => (
          <div key={day} className="grid grid-cols-3 items-end gap-4 p-2 bg-gray-50 dark:bg-slate-900/50 rounded-md">
            <label className="font-semibold text-gray-800 dark:text-gray-200">{day}</label>
            <Input
              label="Open"
              type="time"
              id={`${day}-open`}
              value={hours[day]?.open || ''}
              onChange={e => handleChange(day, 'open', e.target.value)}
            />
            <Input
              label="Close"
              type="time"
              id={`${day}-close`}
              value={hours[day]?.close || ''}
              onChange={e => handleChange(day, 'close', e.target.value)}
            />
          </div>
        ))}
      </div>
    </Modal>
  );
};

export default OperatingHoursModal;
