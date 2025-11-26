import React from 'react';
import { FeedbackTemplate, DisciplineEntry, Memo } from '../../types';

interface NTEPreviewProps {
    template: FeedbackTemplate;
    employeeName: string;
    nteNumber: string;
    allegations: string;
    deadline: Date;
    citedMemos: Memo[];
    citedDiscipline: DisciplineEntry[];
    evidenceUrl?: string;
}

const NTEPreview: React.FC<NTEPreviewProps> = ({ template, employeeName, nteNumber, allegations, deadline, citedMemos, citedDiscipline, evidenceUrl }) => {

    const renderOffenses = () => {
        if (citedMemos.length === 0 && citedDiscipline.length === 0) {
            return <p className="italic text-gray-400">[No offenses cited]</p>;
        }
        return (
            <div className="pl-4 space-y-4">
                {citedMemos.map(memo => (
                     <div key={memo.id} className="mb-2 p-2 border border-dashed border-gray-400 rounded-md bg-gray-50 text-gray-800">
                        <p className="font-bold underline">{memo.title}</p>
                        {/* The whitespace-pre-wrap on the parent can interfere with prose styles. Resetting here. */}
                        <div className="prose prose-sm max-w-none mt-2 whitespace-normal" dangerouslySetInnerHTML={{ __html: memo.body }} />
                    </div>
                ))}
                {citedDiscipline.map(entry => (
                    <div key={entry.id} className="mb-2">
                        <p className="font-bold underline">{entry.category.toUpperCase()} - {entry.code}</p>
                        <p>{entry.description}</p>
                    </div>
                ))}
            </div>
        )
    }

    const processBody = (body: string) => {
        // This is a simple replacement. A more robust solution might use a templating library.
        let processed = body.replace(/{{allegations}}/g, allegations || '[Allegations to be filled]');
        
        const deadlineDate = new Date(deadline);
        const now = new Date();
        const diffTime = Math.abs(deadlineDate.getTime() - now.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        // A simple number to word converter
        const numToWord = (num: number) => {
            if (num === 3) return "three (3)";
            if (num === 5) return "five (5)";
            if (num === 7) return "seven (7)";
            return `${num}`;
        }

        processed = processed.replace(/{{response_deadline_days}}/g, numToWord(diffDays));
        return processed;
    };

    return (
        <div className="p-8 bg-white text-black font-serif text-sm leading-relaxed shadow-lg aspect-[8.5/11]">
            {template.logoUrl && (
                <div className="text-center mb-6">
                    <img src={template.logoUrl} alt="Company Logo" className="h-20 mx-auto" />
                </div>
            )}
            
            <table className="w-full mb-6 font-mono text-xs">
                <tbody>
                    <tr>
                        <td className="font-bold w-1/6">TO</td>
                        <td className="w-1/12">:</td>
                        <td className="w-1/3">{employeeName || '[Employee Name]'}</td>
                        <td className="font-bold w-1/6">DATE</td>
                        <td className="w-1/12">:</td>
                        <td className="w-1/3">{new Date().toLocaleDateString()}</td>
                    </tr>
                    <tr>
                        <td className="font-bold">FROM</td>
                        <td>:</td>
                        <td>{template.from}</td>
                        <td className="font-bold">NTE NO.</td>
                        <td>:</td>
                        <td>{nteNumber}</td>
                    </tr>
                    <tr>
                        <td className="font-bold">SUBJECT</td>
                        <td>:</td>
                        <td>{template.subject}</td>
                        <td className="font-bold">CC</td>
                        <td>:</td>
                        <td>{template.cc}</td>
                    </tr>
                </tbody>
            </table>

            <div className="space-y-4 whitespace-pre-wrap">
                {processBody(template.body).split('{{offenses_list}}').map((part, index) => (
                    <React.Fragment key={index}>
                        <p>{part}</p>
                        {index === 0 && renderOffenses()}
                    </React.Fragment>
                ))}
            </div>
            
            {evidenceUrl && (
                <div className="mt-4">
                    <p className="font-bold">Additional Evidences or Supporting Documents:</p>
                    <a href={evidenceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-all">{evidenceUrl}</a>
                </div>
            )}

            <div className="mt-12">
                <p>For your guidance and compliance.</p>
            </div>
            
            <div className="mt-12">
                {template.signatorySignatureUrl && (
                    <img src={template.signatorySignatureUrl} alt="Signature" className="h-16 mb-2" />
                )}
                <p className="font-bold">{template.signatoryName}</p>
                <p>{template.signatoryTitle}</p>
            </div>
            
             <div className="mt-16 pt-4 border-t border-gray-400">
                <p className="font-bold mb-8">Acknowledgement Receipt of Notice</p>
                <div className="grid grid-cols-3 gap-8">
                    <div className="col-span-2 border-b border-gray-600 pb-1"></div>
                    <div className="border-b border-gray-600 pb-1"></div>
                    <div className="col-span-2 text-center text-xs">Signature over Printed Name</div>
                    <div className="text-center text-xs">Date</div>
                </div>
                 <div className="grid grid-cols-3 gap-8 mt-8">
                    <div className="border-b border-gray-600 pb-1"></div>
                </div>
                 <div className="grid grid-cols-3 gap-8">
                    <div className="text-center text-xs">Time</div>
                </div>
            </div>


        </div>
    );
};

export default NTEPreview;