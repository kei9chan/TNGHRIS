
import React, { useState, useEffect } from 'react';
import { BenefitType, BenefitRequest, BenefitRequestStatus } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import { useSettings } from '../../context/SettingsContext';

interface BenefitRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  benefitType: BenefitType;
  onSave: (request: Partial<BenefitRequest>) => void;
}

const BenefitRequestModal: React.FC<BenefitRequestModalProps> = ({ isOpen, onClose, benefitType, onSave }) => {
  const { user } = useAuth();
  const { settings } = useSettings();
  
  const [amount, setAmount] = useState<string>('');
  const [dateNeeded, setDateNeeded] = useState(new Date().toISOString().split('T')[0]);
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setDateNeeded(new Date().toISOString().split('T')[0]);
      setDetails('');
      setError('');
    }
  }, [isOpen, benefitType]);

  const handleSubmit = () => {
    setError('');
    if (!dateNeeded || !details) {
      setError('Please fill in all required fields.');
      return;
    }

    let parsedAmount = 0;
    if (amount) {
        parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            setError('Please enter a valid positive amount.');
            return;
        }
        if (benefitType.maxValue && parsedAmount > benefitType.maxValue) {
            setError(`Amount cannot exceed the limit of ${settings.currency} ${benefitType.maxValue.toLocaleString()}.`);
            return;
        }
    }

    const requestData: Partial<BenefitRequest> = {
        benefitTypeId: benefitType.id,
        benefitTypeName: benefitType.name,
        employeeId: user?.id,
        employeeName: user?.name,
        amount: parsedAmount || undefined,
        dateNeeded: new Date(dateNeeded),
        details: details,
        status: BenefitRequestStatus.PendingHR,
        submissionDate: new Date(),
    };

    onSave(requestData);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Request Benefit: ${benefitType.name}`}
      footer={
        <div className="flex justify-end w-full space-x-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit}>Submit Request</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-md text-sm text-blue-800 dark:text-blue-200">
            <p className="font-semibold">About this benefit:</p>
            <p>{benefitType.description}</p>
            {benefitType.maxValue && (
                <p className="mt-1 text-xs">Limit: {settings.currency} {benefitType.maxValue.toLocaleString()}</p>
            )}
            {benefitType.requiresBodApproval && (
                <p className="mt-1 text-xs font-semibold text-orange-600 dark:text-orange-400">Note: This request requires final approval from the Board.</p>
            )}
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded">{error}</p>}

        <Input 
            label="Amount (if applicable)" 
            type="number" 
            value={amount} 
            onChange={e => setAmount(e.target.value)} 
            placeholder="e.g. 1000"
            unit={settings.currency}
        />

        <Input 
            label="Date Needed" 
            type="date" 
            value={dateNeeded} 
            onChange={e => setDateNeeded(e.target.value)} 
            required 
        />

        <Textarea 
            label="Justification / Notes" 
            value={details} 
            onChange={e => setDetails(e.target.value)} 
            rows={4} 
            placeholder="Why are you requesting this benefit? Provide specific details." 
            required
        />
      </div>
    </Modal>
  );
};

export default BenefitRequestModal;
