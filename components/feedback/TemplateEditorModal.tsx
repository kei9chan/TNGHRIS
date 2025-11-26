import React, { useState, useEffect } from 'react';
import { FeedbackTemplate } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import FileUploader from '../ui/FileUploader';
import RichTextEditor from '../ui/RichTextEditor';

interface TemplateEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    template: FeedbackTemplate | null;
    onSave: (template: FeedbackTemplate) => void;
}

const TemplateEditorModal: React.FC<TemplateEditorModalProps> = ({ isOpen, onClose, onSave, template }) => {
    const [current, setCurrent] = useState<Partial<FeedbackTemplate>>({});

    useEffect(() => {
        if (isOpen) {
            setCurrent(template || {
                from: "HR OFFICE",
                subject: "NOTICE TO EXPLAIN",
                cc: "GM / BOD / OIC",
            });
        }
    }, [template, isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setCurrent(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleFile = (file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            setCurrent(prev => ({...prev, logoUrl: reader.result as string}));
        };
        reader.readAsDataURL(file);
    }

    const handleSignatureFile = (file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            setCurrent(prev => ({...prev, signatorySignatureUrl: reader.result as string}));
        };
        reader.readAsDataURL(file);
    }

    const handleSave = () => {
        if (!current.title || !current.body) {
            alert("Title and Body are required.");
            return;
        }
        onSave(current as FeedbackTemplate);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={template ? "Edit Feedback Template" : "New Feedback Template"}
            size="4xl"
            footer={
                <div className="flex justify-end w-full">
                    <Button onClick={handleSave}>{template ? "Save Changes" : "Create Template"}</Button>
                </div>
            }
        >
            <div className="space-y-4">
                <Input label="Template Title (Internal)" name="title" value={current.title || ''} onChange={handleChange} required />
                
                <div className="p-4 border rounded-md dark:border-gray-600 space-y-4">
                    <h3 className="font-semibold text-lg">Header Fields</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input label="From" name="from" value={current.from || ''} onChange={handleChange} />
                        <Input label="Subject" name="subject" value={current.subject || ''} onChange={handleChange} />
                        <Input label="CC" name="cc" value={current.cc || ''} onChange={handleChange} />
                        <div>
                             <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Company Logo</label>
                            <FileUploader onFileUpload={handleFile} />
                            {current.logoUrl && <img src={current.logoUrl} alt="Logo Preview" className="mt-2 h-16"/>}
                        </div>
                    </div>
                </div>

                <div className="p-4 border rounded-md dark:border-gray-600 space-y-4">
                    <h3 className="font-semibold text-lg">Body Content</h3>
                     <div className="p-2 bg-gray-100 dark:bg-gray-700/50 rounded-md text-xs">
                        <p className="font-bold">Available Placeholders:</p>
                        <code>{`{{allegations}}`}</code>, <code>{`{{response_deadline_days}}`}</code>, <code>{`{{offenses_list}}`}</code>
                    </div>
                    <RichTextEditor
                        label="Template Body"
                        value={current.body || ''}
                        onChange={(value) => setCurrent(prev => ({ ...prev, body: value }))}
                        rows={10}
                        placeholder="Template Body"
                    />
                </div>

                 <div className="p-4 border rounded-md dark:border-gray-600 space-y-4">
                    <h3 className="font-semibold text-lg">Signatory</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input label="Signatory Name" name="signatoryName" value={current.signatoryName || ''} onChange={handleChange} />
                        <Input label="Signatory Title/Department" name="signatoryTitle" value={current.signatoryTitle || ''} onChange={handleChange} />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Upload Signature Image</label>
                        <FileUploader onFileUpload={handleSignatureFile} />
                        {current.signatorySignatureUrl && (
                            <div className="mt-4">
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Signature Preview:</p>
                                <img src={current.signatorySignatureUrl} alt="Signature Preview" className="mt-2 h-20 border rounded-md p-2 bg-gray-50 dark:bg-gray-900" />
                            </div>
                        )}
                    </div>
                 </div>

            </div>
        </Modal>
    );
};

export default TemplateEditorModal;