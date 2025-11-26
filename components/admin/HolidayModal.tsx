
import React, { useState, useEffect } from 'react';
import { Holiday, HolidayType } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';

interface HolidayModalProps {
  isOpen: boolean;
  onClose: () => void;
  holiday: Holiday | null;
  onSave: (holiday: Holiday) => void;
}

const HolidayModal: React.FC<HolidayModalProps> = ({ isOpen, onClose, holiday, onSave }) => {
  const [current, setCurrent] = useState<Partial<Holiday>>({});

  useEffect(() => {
    if (isOpen) {
      setCurrent(holiday || {
        name: '',
        date: new Date(),
        type: HolidayType.Regular,
        isPaid: true,
      });
    }
  }, [holiday, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
       setCurrent(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
       setCurrent(prev => ({ ...prev, [name]: value }));
    }
  };
  
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setCurrent(prev => ({ ...prev, date: new Date(e.target.value) }));
  }

  const handleSave = () => {
    if (current.name && current.date) {
        // Auto-set isPaid based on type if not manually set? 
        // For now, we trust the form state.
      onSave(current as Holiday);
    } else {
      alert('Holiday Name and Date are required.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={holiday ? 'Edit Holiday' : 'Add New Holiday'}
      footer={
        <div className="flex justify-end w-full space-x-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input 
            label="Holiday Name" 
            name="name" 
            value={current.name || ''} 
            onChange={handleChange} 
            required 
            autoFocus 
        />
        <Input 
            label="Date" 
            name="date" 
            type="date" 
            value={current.date ? new Date(current.date).toISOString().split('T')[0] : ''} 
            onChange={handleDateChange} 
            required 
        />
        <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Type</label>
            <select 
                name="type" 
                value={current.type} 
                onChange={handleChange} 
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
                {Object.values(HolidayType).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
        </div>
        <div className="flex items-center">
            <input 
                id="isPaid" 
                name="isPaid" 
                type="checkbox" 
                checked={current.isPaid} 
                onChange={handleChange} 
                className="h-4 w-4 text-indigo-600 border-gray-300 rounded" 
            />
            <label htmlFor="isPaid" className="ml-2 text-sm text-gray-900 dark:text-gray-300">Paid Holiday</label>
        </div>
      </div>
    </Modal>
  );
};

export default HolidayModal;
