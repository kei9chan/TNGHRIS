import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useSettings } from '../../context/SettingsContext';
import { Settings, Role } from '../../types';
import Button from './Button';
import RichTextEditor from './RichTextEditor';

interface EditableDescriptionProps {
  descriptionKey: keyof Settings;
  className?: string;
}

const EditIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>;

const EditableDescription: React.FC<EditableDescriptionProps> = ({ descriptionKey, className }) => {
  const { user } = useAuth();
  const { settings, updateSettings } = useSettings();
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');

  const description = settings[descriptionKey] as string || '';
  const isAdmin = user?.role === Role.Admin;

  const handleEdit = () => {
    setEditText(description);
    setIsEditing(true);
  };

  const handleSave = () => {
    updateSettings({ [descriptionKey]: editText });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className={`p-4 border rounded-lg bg-gray-50 dark:bg-slate-800/50 dark:border-slate-700 space-y-4 ${className}`}>
        <RichTextEditor
          label="Edit Description"
          value={editText}
          onChange={setEditText}
        />
        <div className="flex justify-end space-x-2">
          <Button variant="secondary" onClick={handleCancel}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative group ${className}`}>
      <div
        className="text-gray-600 dark:text-gray-400"
        dangerouslySetInnerHTML={{ __html: description }}
      />
      {isAdmin && (
        <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button size="sm" variant="secondary" onClick={handleEdit} title="Edit description">
            <EditIcon />
          </Button>
        </div>
      )}
    </div>
  );
};

export default EditableDescription;
