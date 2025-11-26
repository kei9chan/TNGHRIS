
import React, { useState } from 'react';
import { BenefitRequest } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { useSettings } from '../../context/SettingsContext';

interface FulfillmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: BenefitRequest | null;
  onConfirm: (voucherCode: string) => void;
}

const FulfillmentModal: React.FC<FulfillmentModalProps> = ({ isOpen, onClose, request, onConfirm }) => {
  const { settings } = useSettings();
  const [voucherCode, setVoucherCode] = useState('');

  React.useEffect(() => {
    if (isOpen) setVoucherCode('');
  }, [isOpen]);

  const handleConfirm = () => {
    onConfirm(voucherCode);
  };

  if (!request) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Fulfill Benefit Request"
      footer={
        <div className="flex justify-end w-full space-x-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleConfirm}>Confirm Fulfillment</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-md">
            <p><strong>Employee:</strong> {request.employeeName}</p>
            <p><strong>Benefit:</strong> {request.benefitTypeName}</p>
            <p><strong>Amount:</strong> {request.amount ? `${settings.currency} ${request.amount.toLocaleString()}` : 'N/A'}</p>
        </div>
        
        <p className="text-sm text-gray-600 dark:text-gray-400">
            Please provide a voucher code, transaction reference, or note to mark this as fulfilled.
        </p>
        
        <Input 
            label="Voucher Code / Reference / Notes" 
            value={voucherCode} 
            onChange={e => setVoucherCode(e.target.value)} 
            placeholder="e.g. VOUCHER-12345 or 'Cash Released'"
            required
        />
      </div>
    </Modal>
  );
};

export default FulfillmentModal;
