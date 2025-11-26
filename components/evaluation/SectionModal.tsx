import React, { useState, useEffect } from 'react';
import { QuestionSet } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';

interface SectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  section: QuestionSet | null;
  onSave: (section: QuestionSet) => void;
}

const SectionModal: React.FC<SectionModalProps> = ({ isOpen, onClose, section, onSave }) => {
  const [currentSection, setCurrentSection] = useState<Partial<QuestionSet>>(section || {});

  useEffect(() => {
    setCurrentSection(section || { name: '', description: '' });
  }, [section, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setCurrentSection(prev => ({ 
        ...prev, 
        [name]: value
    }));
  };

  const handleSave = () => {
    if (currentSection.name?.trim()) {
      onSave(currentSection as QuestionSet);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={section ? 'Edit Question Set' : 'Add New Question Set'}
      footer={
        <div className="flex justify-end w-full space-x-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave}>{section ? 'Save Changes' : 'Add Set'}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input label="Set Name" id="name" name="name" value={currentSection.name || ''} onChange={handleChange} required />
        <Textarea label="Description" id="description" name="description" value={currentSection.description || ''} onChange={handleChange} rows={3} required />
      </div>
    </Modal>
  );
};

export default SectionModal;