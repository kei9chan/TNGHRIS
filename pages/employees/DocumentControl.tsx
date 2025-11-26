import React from 'react';
import Card from '../../components/ui/Card';
import FileUploader from '../../components/ui/FileUploader';
import { usePermissions } from '../../hooks/usePermissions';
import { Permission } from '../../types';
import Button from '../../components/ui/Button';

const DocumentControl: React.FC = () => {
  const { can } = usePermissions();
  // FIX: The permission check was simplified. The `can` function's logic for 'Create'
  // already covers the 'Manage' case, making the `||` condition redundant. This
  // also resolves the "Expected 2 arguments, but got 3" error.
  const canUpload = can('Files', Permission.Create);

  const handleFileUpload = (file: File) => {
    // In a real app, this would trigger an API call to upload the file
    alert(`(Mock) Uploaded ${file.name} successfully.`);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Document Control</h1>
      <Card title="Secure Document Management">
        <p className="text-gray-700 dark:text-gray-300">
          This section is for managing sensitive employee documents. An approval workflow will be required before any sensitive files can be downloaded to ensure data security.
        </p>
        
        {canUpload ? (
          <div className="mt-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Upload New Document</h3>
            <FileUploader onFileUpload={handleFileUpload} />
            <div className="mt-4 flex justify-end">
                <Button>Submit for Approval</Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-center text-gray-500 dark:text-gray-400">
            You do not have permission to upload new documents.
          </div>
        )}
      </Card>
    </div>
  );
};

export default DocumentControl;