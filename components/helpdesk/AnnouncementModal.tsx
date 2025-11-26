
import React, { useState, useEffect, useMemo } from 'react';
import { Announcement, AnnouncementType } from '../../types';
import { mockBusinessUnits } from '../../services/mockData';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import FileUploader from '../ui/FileUploader';
import { usePermissions } from '../../hooks/usePermissions';

interface AnnouncementModalProps {
  isOpen: boolean;
  onClose: () => void;
  announcement: Partial<Announcement> | null;
  onSave: (announcement: Partial<Announcement>) => void;
}

const AnnouncementModal: React.FC<AnnouncementModalProps> = ({ isOpen, onClose, announcement, onSave }) => {
  const { getAccessibleBusinessUnits } = usePermissions();
  const [current, setCurrent] = useState<Partial<Announcement>>(announcement || {});

  // Get BUs accessible to the creator (usually admin/HR)
  const accessibleBus = useMemo(() => getAccessibleBusinessUnits(mockBusinessUnits), [getAccessibleBusinessUnits]);

  useEffect(() => {
    if (isOpen) {
      setCurrent(announcement || {
        targetGroup: 'All',
        type: AnnouncementType.General,
        businessUnitId: '' // Default to All BUs (empty string)
      });
    }
  }, [announcement, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setCurrent(prev => ({ ...prev, [name]: value }));
  };

  const handleTypeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrent(prev => ({ ...prev, type: e.target.value as AnnouncementType }));
  }

  const handleFile = (file: File) => {
    console.log("Attachment uploaded for announcement:", file.name);
    setCurrent(prev => ({ ...prev, attachmentUrl: file.name }));
  };

  const handleSave = () => {
    if (current.title && current.message) {
      onSave(current);
    } else {
        alert("Title and Message are required.");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={announcement ? 'Edit Announcement' : 'New Announcement'}
      footer={
        <div className="flex justify-end w-full space-x-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave}>{announcement ? 'Save Changes' : 'Post Announcement'}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input label="Title" id="title" name="title" value={current.title || ''} onChange={handleChange} required />
        <Textarea label="Message" id="message" name="message" value={current.message || ''} onChange={handleChange} rows={6} required />
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label htmlFor="targetGroup" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Target Group</label>
                <select id="targetGroup" name="targetGroup" value={current.targetGroup || 'All'} onChange={handleChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    <option>All</option>
                    <option>Management</option>
                    <option>HR</option>
                    <option>Operations</option>
                    <option>Finance</option>
                </select>
            </div>
            <div>
                <label htmlFor="businessUnitId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Target Business Unit</label>
                <select 
                    id="businessUnitId" 
                    name="businessUnitId" 
                    value={current.businessUnitId || ''} 
                    onChange={handleChange} 
                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                    <option value="">All Business Units</option>
                    {accessibleBus.map(bu => (
                        <option key={bu.id} value={bu.id}>{bu.name}</option>
                    ))}
                </select>
            </div>
        </div>
        
        <div>
             <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Type</label>
            <div className="mt-2 flex space-x-4">
                <div className="flex items-center">
                    <input id="type-general" name="type" type="radio" value={AnnouncementType.General} checked={current.type === AnnouncementType.General} onChange={handleTypeChange} className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300" />
                    <label htmlFor="type-general" className="ml-3 block text-sm font-medium text-gray-700 dark:text-gray-300">General</label>
                </div>
                <div className="flex items-center">
                    <input id="type-policy" name="type" type="radio" value={AnnouncementType.Policy} checked={current.type === AnnouncementType.Policy} onChange={handleTypeChange} className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300" />
                    <label htmlFor="type-policy" className="ml-3 block text-sm font-medium text-gray-700 dark:text-gray-300">Policy Alert</label>
                </div>
            </div>
        </div>

        <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Attachment (Optional)</label>
            <FileUploader onFileUpload={handleFile} />
             {current.attachmentUrl && <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Current attachment: {current.attachmentUrl}</p>}
        </div>
      </div>
    </Modal>
  );
};

export default AnnouncementModal;
