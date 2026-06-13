import React from 'react';
import { FeedbackTemplate, DisciplineEntry, Memo } from '../../types';
import { formatExternalUrl } from '../../utils/urlUtils';

interface NTEPreviewProps {
    template: FeedbackTemplate;
    employeeName: string;
    nteNumber: string;
    allegations: string;
    deadline: Date;
    citedMemos: Memo[];
    citedDiscipline: DisciplineEntry[];
    evidenceUrl?: string;
    employeePosition?: string;
    employeeDepartment?: string;
}

const NTEPreview: React.FC<NTEPreviewProps> = ({ template, employeeName, employeePosition, employeeDepartment, nteNumber, allegations, deadline, citedMemos, citedDiscipline, evidenceUrl }) => {

    const renderOffenses = () => {
        const hasExplicitAllegations = template.body.includes('{{allegations}}');
        
        return (
            <div className="space-y-6">
                {!hasExplicitAllegations && allegations && (
                    <div className="pl-4">
                        <p className="font-bold underline mb-2">Detailed Allegations:</p>
                        <p className="whitespace-pre-wrap">{allegations}</p>
                    </div>
                )}

                {(citedMemos.length > 0 || citedDiscipline.length > 0) ? (
                    <div className="pl-4 space-y-4">
                        <p className="font-bold underline mb-2">Cited Offenses:</p>
                        {citedMemos.map(memo => (
                             <div key={memo.id} className="mb-2 p-2 border border-dashed border-gray-400 rounded-md bg-gray-50 text-gray-800">
                                <p className="font-bold underline">{memo.title}</p>
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
                ) : (
                    <p className="italic text-gray-400 pl-4">[No offenses cited]</p>
                )}
            </div>
        )
    }

    const processBody = (body: string) => {
        let processed = body;

        const deadlineDate = new Date(deadline);
        const now = new Date();
        const diffTime = Math.abs(deadlineDate.getTime() - now.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const numToWord = (num: number) => {
            if (num === 3) return "three (3)";
            if (num === 5) return "five (5)";
            if (num === 7) return "seven (7)";
            return `${num}`;
        };

        const replacements: Record<string, string> = {
            '{{allegations}}': allegations || '[Allegations to be filled]',
            '{{employee_name}}': employeeName || '[Employee Name]',
            '{{employee}}': employeeName || '[Employee Name]',
            '{{nte_number}}': nteNumber || '[NTE Number]',
            '{{response_deadline_days}}': numToWord(diffDays),
            '{{response_deadline}}': deadlineDate.toLocaleString(),
            '{{evidence_url}}': evidenceUrl || '[Supporting link]',
        };

        Object.entries(replacements).forEach(([key, value]) => {
            processed = processed.replace(new RegExp(key, 'gi'), value);
        });

        return processed;
    };

    return (
        <div className="p-8 bg-white text-black font-serif text-sm leading-relaxed shadow-lg aspect-[8.5/11]">
            <div className="flex justify-between items-start mb-6 gap-4">
                <table className="w-2/3 text-[15px]">
                    <tbody>
                        <tr>
                            <td className="uppercase w-1/4 align-top">TO</td>
                            <td className="w-4 align-top">:</td>
                            <td className="font-bold align-top">{employeeName || '[Employee Name]'}</td>
                        </tr>
                        <tr>
                            <td className="uppercase align-top">POSITION</td>
                            <td className="align-top">:</td>
                            <td className="font-bold align-top">{employeePosition || '[Employee Position]'}</td>
                        </tr>
                        <tr>
                            <td className="uppercase align-top pb-6">DEPARTMENT</td>
                            <td className="align-top pb-6">:</td>
                            <td className="font-bold align-top pb-6">{employeeDepartment || '[Employee Department]'}</td>
                        </tr>
                        
                        <tr>
                            <td className="uppercase align-top">FROM</td>
                            <td className="align-top">:</td>
                            <td className="font-bold align-top">{template.from}</td>
                        </tr>
                        <tr>
                            <td className="uppercase align-top">DATE ISSUED</td>
                            <td className="align-top">:</td>
                            <td className="font-bold align-top">{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</td>
                        </tr>
                        <tr>
                            <td className="uppercase align-top">NTE CODE</td>
                            <td className="align-top">:</td>
                            <td className="font-bold align-top">{nteNumber}</td>
                        </tr>
                        <tr>
                            <td className="uppercase align-top pb-6">CC</td>
                            <td className="align-top pb-6">:</td>
                            <td className="font-bold align-top pb-6">{template.cc}</td>
                        </tr>

                        <tr>
                            <td className="uppercase align-top">SUBJECT</td>
                            <td className="align-top">:</td>
                            <td className="font-bold align-top">{template.subject}</td>
                        </tr>
                    </tbody>
                </table>

                {template.logoUrl && (
                    <div className="w-1/3 flex justify-end">
                        <img 
                            src={template.logoUrl} 
                            alt="Company Logo" 
                            className="max-h-48 max-w-full object-contain" 
                        />
                    </div>
                )}
            </div>

            <div className="space-y-4 whitespace-pre-wrap">
                {processBody(template.body).split('{{offenses_list}}').map((part, index) => (
                    <React.Fragment key={index}>
                        <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: part }} />
                        {index === 0 && renderOffenses()}
                    </React.Fragment>
                ))}
            </div>
            
            {evidenceUrl && (
                <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-6 text-sm">
                    <strong>Supporting Documents / Evidence:</strong><br />
                    <a href={formatExternalUrl(evidenceUrl)} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-all">{evidenceUrl}</a>
                </div>
            )}

            <div className="mt-12">
                <p>For your guidance and compliance.</p>
            </div>
            
            <div className="mt-12">
                {template.signatorySignatureUrl && (
                    <img 
                        src={template.signatorySignatureUrl} 
                        alt="Signature" 
                        className="h-16 mb-2 object-contain" 
                        style={{ display: 'block' }}
                    />
                )}
                <p className="font-bold">{template.signatoryName}</p>
                <p>{template.signatoryTitle}</p>
            </div>
            
             <div className="mt-16 pt-4 border-t border-gray-400">
                <p className="font-bold mb-12">Acknowledgement Receipt of Notice</p>
                <div className="flex justify-between gap-12">
                    <div className="w-[55%] text-center">
                        <div className="border-b border-gray-800 w-full"></div>
                        <div className="text-xs mt-1">Signature over Printed Name</div>
                    </div>
                    <div className="w-[35%] text-center">
                        <div className="border-b border-gray-800 w-full"></div>
                        <div className="text-xs mt-1">Date & Time</div>
                    </div>
                </div>
            </div>


        </div>
    );
};

export default NTEPreview;
