import {COMPANY_GRACE_MINUTES,UNPAID_LUNCH_MINUTES,validateScheduleTemplate} from '../../services/schedulePolicy';
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
    setCurrentTemplate(template ? {...template,gracePeriodMinutes:COMPANY_GRACE_MINUTES,breakMinutes:template.scheduleKind==='rest'||template.scheduleKind==='no_schedule'?0:UNPAID_LUNCH_MINUTES} : {
        name: '',
        startTime: '08:00',
        endTime: '17:00',
        breakMinutes: 60,
        gracePeriodMinutes: COMPANY_GRACE_MINUTES,
        scheduleKind: 'work',
        endDayOffset: 0,
        businessUnitId: businessUnitId,
        color: 'blue',
        isFlexible: false,
    });
  }, [template, isOpen, businessUnitId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if(name==='paidHours'){setCurrentTemplate(prev=>({...prev,paidMinutes:value===''?undefined:Math.round(Number(value)*60),minHoursPerDay:value===''?undefined:Number(value)}));return;}
    if(name==='endDayOffset'){setCurrentTemplate(prev=>({...prev,endDayOffset:(e.target as HTMLInputElement).checked?1:0}));return;}
    if (type === 'checkbox') {
        const { checked } = e.target as HTMLInputElement;
        const isFlexible = checked;
        setCurrentTemplate(prev => ({ 
            ...prev, 
            isFlexible,
            // when switching, reset irrelevant fields
            startTime: isFlexible ? '00:00' : prev.startTime === '00:00' ? '08:00' : prev.startTime,
            endTime: isFlexible ? '00:00' : prev.endTime === '00:00' ? '17:00' : prev.endTime,
            breakMinutes: 60,
            minHoursPerDay: isFlexible ? prev.minHoursPerDay : undefined,
            minDaysPerWeek: isFlexible ? prev.minDaysPerWeek || 5 : undefined,
        }));
    } else {
        setCurrentTemplate(prev => ({ ...prev, [name]: type === 'number' ? parseFloat(value) || 0 : value }));
    }
  };

  const handleSave = () => {
    const error=validateScheduleTemplate(currentTemplate);
    if(error){alert(error);return;}
    onSave({...currentTemplate,gracePeriodMinutes:COMPANY_GRACE_MINUTES,breakMinutes:currentTemplate.scheduleKind==='rest'||currentTemplate.scheduleKind==='no_schedule'?0:60} as ShiftTemplate);
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
        <label className="block text-sm">Day type<select name="scheduleKind" value={currentTemplate.scheduleKind??'work'} onChange={handleChange} className="mt-1 block w-full rounded border p-2 dark:bg-slate-800"><option value="work">Working shift</option><option value="rest">Rest Day</option><option value="no_schedule">Leave / No Schedule</option></select></label>
        {currentTemplate.scheduleKind!=='rest'&&currentTemplate.scheduleKind!=='no_schedule'&&<div className="flex items-center">
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

        }
        {currentTemplate.scheduleKind==='rest'?<p>Explicit rest day. No working hours are assumed.</p>:currentTemplate.scheduleKind==='no_schedule'?<div><p>Explicit non-working day. Approved leave remains in the existing leave workflow.</p><Input label="Planned hours for leave valuation (when applicable)" name="paidHours" type="number" min="0.25" max="23" step="0.25" value={currentTemplate.paidMinutes==null?'':currentTemplate.paidMinutes/60} onChange={handleChange}/></div>:currentTemplate.isFlexible ? (
            <div className="grid grid-cols-2 gap-4 pt-4 border-t dark:border-gray-600">
                <Input label="Paid hours per day (excluding lunch)" name="paidHours" type="number" min="0.25" max="23" step="0.25" value={currentTemplate.paidMinutes==null?'':currentTemplate.paidMinutes/60} onChange={handleChange} required />
                <Input label="Min Days per Week" name="minDaysPerWeek" type="number" value={currentTemplate.minDaysPerWeek ?? ''} onChange={handleChange} required />
            </div>
        ) : (
            <div className="space-y-4 pt-4 border-t dark:border-gray-600">
                <div className="grid grid-cols-2 gap-4">
                    <Input label="Start Time" id="startTime" name="startTime" type="time" value={currentTemplate.startTime || ''} onChange={handleChange} required />
                    <Input label="End Time" id="endTime" name="endTime" type="time" value={currentTemplate.endTime || ''} onChange={handleChange} required />
                </div>
                <label className="flex items-center gap-2"><input name="endDayOffset" type="checkbox" checked={currentTemplate.endDayOffset===1} onChange={handleChange}/>Ends the next day</label>
                <div className="grid grid-cols-2 gap-4">
                    <Input label="Unpaid lunch (minutes)" type="number" value={60} readOnly />
                    <Input label="Company grace (minutes)" type="number" value={5} readOnly />
                </div>
            </div>
        )}
        
        <p className="text-sm">Company policy: 5-minute grace; 60-minute lunch is unpaid. Working through lunch requires the existing approved OT workflow.</p>
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
