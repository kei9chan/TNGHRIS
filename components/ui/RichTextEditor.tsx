import React, { useEffect, useRef, useCallback } from 'react';

// Quill will be a global from the script tag in index.html
declare var Quill: any;

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  rows?: number;
  placeholder?: string;
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, label, rows = 10, placeholder }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const quillInstance = useRef<any>(null);

  const initQuill = useCallback(() => {
    if (editorRef.current && !quillInstance.current) {
        const quill = new Quill(editorRef.current, {
            modules: {
                toolbar: [
                    [{ 'header': [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline'],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    [{ 'align': [] }],
                    ['link'],
                    ['clean']
                ]
            },
            placeholder,
            theme: 'snow'
        });

        quill.on('text-change', (delta: any, oldDelta: any, source: string) => {
            if (source === 'user') {
                let html = quill.root.innerHTML;
                // When editor is empty, quill puts '<p><br></p>', convert this to an empty string for consistency
                if (html === '<p><br></p>') {
                    html = '';
                }
                onChange(html);
            }
        });

        quillInstance.current = quill;
    }
  }, [onChange, placeholder]);

  // Main effect to initialize and handle value changes
  useEffect(() => {
    initQuill();
    const quill = quillInstance.current;
    if (quill) {
        // Prevent cursor jump by only updating if content is different
        if (quill.root.innerHTML !== value) {
            // 'silent' source is important to prevent firing text-change event and causing a loop
            const delta = quill.clipboard.convert(value);
            quill.setContents(delta, 'silent');
        }
    }
  }, [value, initQuill]);

  const editorStyle = {
      minHeight: `${rows * 1.5}rem`,
  };

  return (
    <div>
      {label && <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>}
      <div className="rounded-md shadow-sm overflow-hidden border border-gray-300 dark:border-gray-600">
        <div ref={editorRef} style={editorStyle} />
      </div>
       <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {`Saved as HTML. Links are clickable. Placeholders like {{employee_name}} will be replaced on generation.`}
       </p>
    </div>
  );
};

export default RichTextEditor;