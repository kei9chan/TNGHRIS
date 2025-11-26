
import React, { useState, useEffect } from 'react';
import { BenefitType } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';

interface BenefitTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  benefitType: BenefitType | null;
  onSave: (benefitType: BenefitType) => void;
}

const BenefitTypeModal: React.FC<BenefitTypeModalProps> = ({ isOpen, onClose, benefitType, onSave }) => {
  const [current, setCurrent] = useState<Partial<BenefitType>>({});

  useEffect(() => {
    if (isOpen) {
      setCurrent(benefitType || {
        name: '',
        description: '',
        requiresBodApproval: false,
        isActive: true,
      });
    }
  }, [benefitType, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
        const { checked } = e.target as HTMLInputElement;
        setCurrent(prev => ({ ...prev, [name]: checked }));
    } else {
        setCurrent(prev => ({ 
            ...prev, 
            [name]: type === 'number' ? (value ? parseFloat(value) : undefined) : value 
        }));
    }
  };

  const handleSave = () => {
    if (current.name && current.description) {
      onSave(current as BenefitType);
    } else {
        alert("Name and Description are required.");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={benefitType ? 'Edit Benefit Type' : 'New Benefit Type'}
      footer={
        <div className="flex justify-end w-full space-x-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input 
            label="Benefit Name" 
            name="name" 
            value={current.name || ''} 
            onChange={handleChange} 
            required 
            placeholder="e.g. Meal Voucher"
        />
        <Textarea 
            label="Description" 
            name="description" 
            value={current.description || ''} 
            onChange={handleChange} 
            rows={3} 
            required 
            placeholder="Describe the benefit and eligibility rules."
        />
        <Input 
            label="Max Value / Limit (Optional)" 
            name="maxValue" 
            type="number" 
            value={current.maxValue || ''} 
            onChange={handleChange} 
            placeholder="e.g. 5000"
        />
        
        <div className="flex items-center">
            <input 
                id="requiresBodApproval" 
                name="requiresBodApproval" 
                type="checkbox" 
                checked={current.requiresBodApproval || false} 
                onChange={handleChange} 
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded" 
            />
            <label htmlFor="requiresBodApproval" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
                Requires Board of Director (BOD) Approval
            </label>
        </div>

        <div className="flex items-center">
            <input 
                id="isActive" 
                name="isActive" 
                type="checkbox" 
                checked={current.isActive !== false} 
                onChange={handleChange} 
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded" 
            />
            <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
                Active
            </label>
        </div>
      </div>
    </Modal>
  );
};

export default BenefitTypeModal;
