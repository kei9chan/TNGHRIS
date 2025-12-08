

import React, { useState, useCallback } from 'react';
import { MAX_FILE_SIZE, ALLOWED_FILE_TYPES, ALLOWED_FILE_EXTENSIONS } from '../../constants';
import Button from './Button';

interface FileUploaderProps {
  onFileUpload: (file: File) => void | Promise<void>;
  maxSize?: number; // in bytes
}

const UploadIcon = () => (
    <svg className="w-8 h-8 mb-4 text-gray-500 dark:text-gray-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
        <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
    </svg>
);


const FileUploader: React.FC<FileUploaderProps> = ({ onFileUpload, maxSize }) => {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);

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
  
  const sizeLimitInMB = (maxSize || MAX_FILE_SIZE) / 1024 / 1024;


  return (
    <div>
        <div 
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            className={`flex items-center justify-center w-full relative ${isDragging ? 'border-blue-500' : 'border-gray-300 dark:border-gray-600'}`}
        >
            <label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer bg-gray-50 dark:hover:bg-bray-800 dark:bg-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:hover:border-gray-500 dark:hover:bg-gray-600 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <UploadIcon />
                    <p className="mb-2 text-sm text-gray-500 dark:text-gray-400"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">PDF, JPG, PNG, DOCX, XLSX (MAX. {sizeLimitInMB}MB)</p>
                </div>
                <input id="dropzone-file" type="file" className="hidden" onChange={handleFileChange} />
            </label>
        </div> 

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {file && !error && (
        <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-700 rounded-md text-sm">
          <p className="font-semibold text-gray-800 dark:text-gray-200">Selected file:</p>
          <p className="text-gray-600 dark:text-gray-400">{file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</p>
        </div>
      )}
       <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">All uploaded files will be scanned for viruses.</p>
    </div>
  );
};

export default FileUploader;
