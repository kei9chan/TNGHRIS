

import React, { useState, useCallback, useEffect } from 'react';
import { MAX_FILE_SIZE, ALLOWED_FILE_TYPES, ALLOWED_FILE_EXTENSIONS } from '../../constants';
import Button from './Button';

interface FileUploaderProps {
  onFileUpload: (file: File) => void | Promise<void>;
  maxSize?: number; // in bytes
  inputId?: string;
  existingFileUrl?: string; // URL of previously uploaded file
  readOnly?: boolean; // If true, hide upload UI and only show existing file
  disabled?: boolean; // If true, disable file input and show uploading state
}

const UploadIcon = () => (
    <svg className="w-8 h-8 mb-4 text-gray-500 dark:text-gray-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
        <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
    </svg>
);

const isImageFile = (file?: File | null, url?: string): boolean => {
    if (file) {
        return file.type.startsWith('image/');
    }
    if (url) {
        // Strip query params before checking extension
        const pathOnly = url.split('?')[0].toLowerCase();
        return pathOnly.endsWith('.jpg') || pathOnly.endsWith('.jpeg') || pathOnly.endsWith('.png') || pathOnly.endsWith('.gif') || pathOnly.endsWith('.webp') || pathOnly.endsWith('.svg');
    }
    return false;
};

const FileUploader: React.FC<FileUploaderProps> = ({ onFileUpload, maxSize, inputId, existingFileUrl, readOnly, disabled }) => {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const controlId = inputId || 'dropzone-file';

  // Generate preview URL for images
  useEffect(() => {
    if (file && isImageFile(file)) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [file]);

  const validateFile = (selectedFile: File): boolean => {
    if (!selectedFile) return false;
    
    const sizeLimit = maxSize || MAX_FILE_SIZE;

    if (selectedFile.size > sizeLimit) {
      setError(`File size cannot exceed ${sizeLimit / 1024 / 1024} MB.`);
      return false;
    }

    if (!ALLOWED_FILE_TYPES.includes(selectedFile.type)) {
      setError(`Invalid file type. Allowed types: ${ALLOWED_FILE_EXTENSIONS.join(', ')}`);
      return false;
    }
    
    setError('');
    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && validateFile(selectedFile)) {
      setFile(selectedFile);
      onFileUpload(selectedFile);
    } else {
        setFile(null);
    }
  };
  
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile && validateFile(droppedFile)) {
        setFile(droppedFile);
        onFileUpload(droppedFile);
    } else {
        setFile(null);
    }
  }, [onFileUpload]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };
  
  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleRemoveFile = () => {
    setFile(null);
    setPreviewUrl(null);
  };
  
  const sizeLimitInMB = (maxSize || MAX_FILE_SIZE) / 1024 / 1024;

  // Show the preview of the newly selected file
  const showNewFilePreview = file && !error;
  // Show the existing uploaded file (for reviewers or returning users)
  const showExistingFile = !file && existingFileUrl;

  // Read-only mode: only show existing file, no upload UI
  if (readOnly) {
    return (
      <div>
        {existingFileUrl ? (
          <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
            <p className="font-semibold text-gray-800 dark:text-gray-200 mb-3">Submitted File:</p>
            {isImageFile(null, existingFileUrl) ? (
              <div className="rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800">
                <a href={existingFileUrl} target="_blank" rel="noopener noreferrer">
                  <img src={existingFileUrl} alt="Submitted file" className="max-h-96 w-auto mx-auto object-contain p-2 hover:opacity-90 transition-opacity" />
                </a>
              </div>
            ) : (
              <a href={existingFileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-600 hover:border-indigo-400 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-indigo-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-sm text-indigo-600 dark:text-indigo-400 underline">View submitted file</span>
              </a>
            )}
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Click the image to view full size in a new tab.</p>
          </div>
        ) : (
          <p className="text-gray-500 dark:text-gray-400 italic">No file has been submitted yet.</p>
        )}
      </div>
    );
  }

  return (
    <div>
        {/* Dropzone - hide if file is selected */}
        {!file && !existingFileUrl && (
          <div 
              onDrop={disabled ? undefined : handleDrop}
              onDragOver={disabled ? undefined : handleDragOver}
              onDragEnter={disabled ? undefined : handleDragEnter}
              onDragLeave={disabled ? undefined : handleDragLeave}
              className={`flex items-center justify-center w-full relative ${disabled ? 'opacity-50 pointer-events-none' : ''} ${isDragging ? 'border-blue-500' : 'border-gray-300 dark:border-gray-600'}`}
          >
              <label htmlFor={controlId} className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer bg-gray-50 dark:hover:bg-bray-800 dark:bg-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:hover:border-gray-500 dark:hover:bg-gray-600 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <UploadIcon />
                      {disabled ? (
                        <p className="mb-2 text-sm text-gray-500 dark:text-gray-400"><span className="font-semibold">Uploading...</span></p>
                      ) : (
                        <>
                          <p className="mb-2 text-sm text-gray-500 dark:text-gray-400"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">PDF, JPG, PNG, DOCX, XLSX (MAX. {sizeLimitInMB}MB)</p>
                        </>
                      )}
                  </div>
                  <input id={controlId} type="file" className="hidden" onChange={handleFileChange} disabled={disabled} />
              </label>
          </div>
        )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {/* New file preview */}
      {showNewFilePreview && (
        <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-200">Selected file:</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">{file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</p>
            </div>
            <button
              onClick={handleRemoveFile}
              className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 p-1 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
              title="Remove file"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {previewUrl && (
            <div className="mt-2 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800">
              <img src={previewUrl} alt="Preview" className="max-h-72 w-auto mx-auto object-contain p-2" />
            </div>
          )}
          {!previewUrl && (
            <div className="mt-2 flex items-center gap-2 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-indigo-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-sm text-gray-600 dark:text-gray-300">{file.name}</span>
            </div>
          )}
        </div>
      )}

      {/* Existing uploaded file preview (for reviewers or returning users) */}
      {showExistingFile && (
        <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
          <p className="font-semibold text-gray-800 dark:text-gray-200 mb-3">Uploaded File:</p>
          {isImageFile(null, existingFileUrl) ? (
            <div className="rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800">
              <img src={existingFileUrl} alt="Uploaded file" className="max-h-72 w-auto mx-auto object-contain p-2" />
            </div>
          ) : (
            <a href={existingFileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-600 hover:border-indigo-400 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-indigo-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-sm text-indigo-600 dark:text-indigo-400 underline">View uploaded file</span>
            </a>
          )}
        </div>
      )}

       <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">All uploaded files will be scanned for viruses.</p>
    </div>
  );
};

export default FileUploader;
