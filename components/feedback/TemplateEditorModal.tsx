import React, { useState, useEffect } from 'react';
import { FeedbackTemplate } from '../../types';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import FileUploader from '../ui/FileUploader';
import RichTextEditor from '../ui/RichTextEditor';
import { supabase } from '../../services/supabaseClient';

interface TemplateEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    template: FeedbackTemplate | null;
    onSave: (template: FeedbackTemplate) => void;
}

const TemplateEditorModal: React.FC<TemplateEditorModalProps> = ({ isOpen, onClose, onSave, template }) => {
    const [current, setCurrent] = useState<Partial<FeedbackTemplate>>({});
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [uploadingSignature, setUploadingSignature] = useState(false);

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

    const uploadLogoToBucket = async (file: File) => {
        const bucket = 'feedback-templates-assets';
        const ext = file.name.split('.').pop() || 'bin';
        const path = `logos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
            cacheControl: '3600',
            upsert: false,
        });
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        return data.publicUrl;
    };

    const uploadSignatureToBucket = async (file: File) => {
        const bucket = 'feedback-templates-assets';
        const ext = file.name.split('.').pop() || 'bin';
        const path = `signatures/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
            cacheControl: '3600',
            upsert: false,
        });
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        return data.publicUrl;
    };

    const handleFile = async (file: File) => {
        try {
            setUploadingLogo(true);
            const url = await uploadLogoToBucket(file);
            setCurrent(prev => ({...prev, logoUrl: url}));
        } catch (err) {
            console.error('Logo upload failed', err);
            alert('Failed to upload logo. Please try again.');
        } finally {
            setUploadingLogo(false);
        }
    }

    const handleSignatureFile = async (file: File) => {
        try {
            setUploadingSignature(true);
            const url = await uploadSignatureToBucket(file);
            setCurrent(prev => ({...prev, signatorySignatureUrl: url}));
        } catch (err) {
            console.error('Signature upload failed', err);
            alert('Failed to upload signature. Please try again.');
        } finally {
            setUploadingSignature(false);
        }
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
                            <FileUploader onFileUpload={handleFile} disabled={uploadingLogo} inputId="logo-upload" />
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
                        <FileUploader onFileUpload={handleSignatureFile} disabled={uploadingSignature} inputId="signature-upload" />
                        {current.signatorySignatureUrl && (
                            <div className="mt-4">
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Signature Preview:</p>
                                <img src={current.signatorySignatureUrl} alt="Signature Preview" className="mt-2 h-20 border rounded-md p-2 bg-gray-50 dark:bg-gray-900" />
                            </div>
                        )}
                        {!current.signatorySignatureUrl && !uploadingSignature && (
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">No signature selected yet.</p>
                        )}
                        {uploadingSignature && (
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Uploading signature...</p>
                        )}
                    </div>
                 </div>

            </div>
        </Modal>
    );
};

export default TemplateEditorModal;
