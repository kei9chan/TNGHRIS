import React, { useState, useEffect } from 'react';
import { PANTemplate, PANActionTaken } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import FileUploader from '../ui/FileUploader';
import { supabase } from '../../services/supabaseClient';

const emptyActions: PANActionTaken = { changeOfStatus: false, promotion: false, transfer: false, salaryIncrease: false, changeOfJobTitle: false, others: '' };


interface PANTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: PANTemplate | null;
  onSave: (template: PANTemplate) => void;
}

const PANTemplateModal: React.FC<PANTemplateModalProps> = ({ isOpen, onClose, template, onSave }) => {
  const [current, setCurrent] = useState<Partial<PANTemplate>>({});
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCurrent(template || { name: '', actionTaken: {...emptyActions}, notes: '', logoUrl: '', preparerName: '', preparerSignatureUrl: '' });
      setLogoFile(null);
      setSignatureFile(null);
    }
  }, [template, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setCurrent(prev => ({ ...prev, [name]: value }));
  };

  const handleActionTakenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked, type, value } = e.target;
    setCurrent(prev => ({
        ...prev,
        actionTaken: {
            ...(prev.actionTaken || emptyActions),
            [name]: type === 'checkbox' ? checked : value,
        }
    }));
  };
  
  const handleLogoFile = (file: File) => {
    setLogoFile(file);
    setCurrent(prev => ({ ...prev, logoUrl: URL.createObjectURL(file) }));
  };
  
  const handleSignatureFile = (file: File) => {
    setSignatureFile(file);
    setCurrent(prev => ({ ...prev, preparerSignatureUrl: URL.createObjectURL(file) }));
  };

  const uploadAttachment = async (file: File) => {
    const path = `templates/${(crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString())}-${file.name}`;
    const { data, error } = await supabase.storage.from('pan_templates_attachments').upload(path, file);
    if (error) throw error;
    const { data: publicUrl } = supabase.storage.from('pan_templates_attachments').getPublicUrl(data.path);
    return publicUrl.publicUrl;
  };

  const handleSave = async () => {
    if (!current.name) {
      alert('Template Name is required.');
      return;
    }
    try {
      let logoUrl = current.logoUrl;
      let signatureUrl = current.preparerSignatureUrl;
      if (logoFile) {
        logoUrl = await uploadAttachment(logoFile);
      }
      if (signatureFile) {
        signatureUrl = await uploadAttachment(signatureFile);
      }
      onSave({
        ...(current as PANTemplate),
        logoUrl,
        preparerSignatureUrl: signatureUrl,
      });
    } catch (err) {
      console.error('Failed to upload attachments', err);
      alert('Failed to upload attachments.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={template ? 'Edit PAN Template' : 'Create New PAN Template'}
      footer={
        <div className="flex justify-end w-full">
          <Button onClick={handleSave}>{template ? 'Save Changes' : 'Create Template'}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input 
          label="Template Name" 
          name="name" 
          value={current.name || ''} 
          onChange={handleChange} 
          required 
        />
         <div className="p-4 border rounded-md dark:border-gray-600">
             <h3 className="font-semibold mb-2">Company Logo (Optional)</h3>
             <FileUploader onFileUpload={handleLogoFile} />
             {current.logoUrl && <img src={current.logoUrl} alt="Logo preview" className="mt-4 max-h-24" />}
        </div>
        <div className="p-4 border rounded-md dark:border-gray-600">
            <h3 className="font-semibold mb-2">Default Action Taken:</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.keys(emptyActions).filter(k => k !== 'others').map(actionKey => (
                    <div key={actionKey} className="flex items-center">
                        <input type="checkbox" id={`template-${actionKey}`} name={actionKey} checked={current.actionTaken?.[actionKey as keyof PANActionTaken] as boolean || false} onChange={handleActionTakenChange} className="h-4 w-4 text-indigo-600 border-gray-300 rounded"/>
                        <label htmlFor={`template-${actionKey}`} className="ml-2 text-gray-700 dark:text-gray-300 capitalize">{actionKey.replace(/([A-Z])/g, ' $1')}</label>
                    </div>
                ))}
                <div className="flex items-center col-span-2 md:col-span-1">
                    <input type="checkbox" id="template-others-check" name="others" checked={!!current.actionTaken?.others} readOnly className="h-4 w-4 text-indigo-600 border-gray-300 rounded"/>
                    <label htmlFor="template-others-check" className="ml-2 text-gray-700 dark:text-gray-300">Others:</label>
                    <input type="text" name="others" value={current.actionTaken?.others || ''} onChange={handleActionTakenChange} className="ml-2 flex-grow bg-transparent border-b border-gray-400 dark:border-gray-500 focus:outline-none focus:ring-0 focus:border-indigo-500"/>
                </div>
            </div>
        </div>

        <div className="p-4 border rounded-md dark:border-gray-600 space-y-4">
            <h3 className="font-semibold text-lg">Preparer Details (HR Manager)</h3>
            <Input 
                label="Preparer's Name" 
                name="preparerName" 
                value={current.preparerName || ''} 
                onChange={handleChange} 
            />
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Upload Preparer's Signature</label>
                <FileUploader onFileUpload={handleSignatureFile} />
                {current.preparerSignatureUrl && <img src={current.preparerSignatureUrl} alt="Signature preview" className="mt-4 max-h-24 p-2 bg-gray-100 dark:bg-gray-700 rounded-md" />}
            </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md border border-blue-100 dark:border-blue-800 text-sm">
            <p className="font-bold text-blue-800 dark:text-blue-200 mb-1">Available Placeholder:</p>
            <code className="bg-white dark:bg-slate-800 px-1 py-0.5 rounded border border-blue-200 dark:border-blue-700 font-mono">{`{{effective_date}}`}</code>
            <span className="ml-2 text-xs text-gray-600 dark:text-gray-400">(Automatically replaced by the selected Effectivity Date)</span>
        </div>

        <Textarea 
          label="Default Remarks / Justifications" 
          name="notes" 
          value={current.notes || ''} 
          onChange={handleChange} 
          rows={6}
          placeholder="Type default remarks here. You can use placeholders like {{effective_date}}."
        />
      </div>
    </Modal>
  );
};

export default PANTemplateModal;
