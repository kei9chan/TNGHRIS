import React, { useState, useEffect } from 'react';
import { ShiftTemplate } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';

interface ShiftTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: ShiftTemplate | null;
  onSave: (template: ShiftTemplate) => void;
  businessUnitId: string;
}

const colors = ['gray', 'yellow', 'cyan', 'green', 'blue', 'indigo'];

const ShiftTemplateModal: React.FC<ShiftTemplateModalProps> = ({ isOpen, onClose, template, onSave, businessUnitId }) => {
  const [currentTemplate, setCurrentTemplate] = useState<Partial<ShiftTemplate>>(template || {});

  useEffect(() => {
    setCurrentTemplate(template || {
        name: '',
        startTime: '08:00',
        endTime: '17:00',
        breakMinutes: 60,
        gracePeriodMinutes: 15,
        businessUnitId: businessUnitId,
        color: 'blue',
        isFlexible: false,
    });
  }, [template, isOpen, businessUnitId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
        const { checked } = e.target as HTMLInputElement;
        const isFlexible = checked;
        setCurrentTemplate(prev => ({ 
            ...prev, 
            isFlexible,
            // when switching, reset irrelevant fields
            startTime: isFlexible ? '00:00' : prev.startTime === '00:00' ? '08:00' : prev.startTime,
            endTime: isFlexible ? '00:00' : prev.endTime === '00:00' ? '17:00' : prev.endTime,
            breakMinutes: isFlexible ? 0 : prev.breakMinutes === 0 ? 60 : prev.breakMinutes,
            minHoursPerDay: isFlexible ? prev.minHoursPerDay || 8 : undefined,
            minDaysPerWeek: isFlexible ? prev.minDaysPerWeek || 5 : undefined,
        }));
    } else {
        setCurrentTemplate(prev => ({ ...prev, [name]: type === 'number' ? parseInt(value) || 0 : value }));
    }
  };

  const handleSave = () => {
    if (currentTemplate.name && (currentTemplate.isFlexible || (currentTemplate.startTime && currentTemplate.endTime))) {
      onSave(currentTemplate as ShiftTemplate);
    } else {
        alert('Please fill in all required fields.');
    }
  };
  
  const shiftColorClasses: Record<string, string> = {
    blue: 'bg-blue-500',
    indigo: 'bg-indigo-500',
    yellow: 'bg-yellow-400',
    green: 'bg-green-500',
    cyan: 'bg-cyan-500',
    gray: 'bg-gray-500',
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={template ? 'Edit Shift Preset' : 'Create Shift Preset'}
      footer={
        <div className="flex justify-end w-full space-x-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave}>{template ? 'Save Changes' : 'Create Preset'}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input label="Preset Name" id="name" name="name" value={currentTemplate.name || ''} onChange={handleChange} required />
        <div className="flex items-center">
            <input 
                id="isFlexible" 
                name="isFlexible" 
                type="checkbox" 
                checked={currentTemplate.isFlexible || false} 
                onChange={handleChange}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded" 
            />
            <label htmlFor="isFlexible" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
                This is a Flexible Shift
            </label>
        </div>

        {currentTemplate.isFlexible ? (
            <div className="grid grid-cols-2 gap-4 pt-4 border-t dark:border-gray-600">
                <Input label="Min Hours per Day" name="minHoursPerDay" type="number" value={currentTemplate.minHoursPerDay ?? ''} onChange={handleChange} required />
                <Input label="Min Days per Week" name="minDaysPerWeek" type="number" value={currentTemplate.minDaysPerWeek ?? ''} onChange={handleChange} required />
            </div>
        ) : (
            <div className="space-y-4 pt-4 border-t dark:border-gray-600">
                <div className="grid grid-cols-2 gap-4">
                    <Input label="Start Time" id="startTime" name="startTime" type="time" value={currentTemplate.startTime || ''} onChange={handleChange} required />
                    <Input label="End Time" id="endTime" name="endTime" type="time" value={currentTemplate.endTime || ''} onChange={handleChange} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <Input label="Break (minutes)" id="breakMinutes" name="breakMinutes" type="number" value={currentTemplate.breakMinutes ?? 60} onChange={handleChange} required />
                    <Input label="Grace Period (minutes)" id="gracePeriodMinutes" name="gracePeriodMinutes" type="number" value={currentTemplate.gracePeriodMinutes ?? 15} onChange={handleChange} required />
                </div>
            </div>
        )}
        
        <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Color</label>
            <div className="mt-2 flex space-x-2">
                {colors.map(color => (
                    <button
                        key={color}
                        type="button"
                        onClick={() => setCurrentTemplate(prev => ({ ...prev, color }))}
                        className={`w-8 h-8 rounded-full ${shiftColorClasses[color]} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${currentTemplate.color === color ? 'ring-2 ring-offset-2 ring-indigo-500' : ''}`}
                        aria-label={`Select ${color} color`}
                    />
                ))}
            </div>
        </div>
      </div>
    </Modal>
  );
};

export default ShiftTemplateModal;
