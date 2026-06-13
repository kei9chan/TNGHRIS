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
            <div className="space-y-6 mt-6">
                {!hasExplicitAllegations && allegations && (
                    <div className="relative border border-slate-400 rounded-md p-5 pt-6 mt-8">
                         <div className="absolute -top-3 left-4 bg-slate-900 text-white text-[10px] font-bold px-3 py-1 rounded uppercase tracking-wider">
                            DETAILED ALLEGATIONS
                        </div>
                        <p className="whitespace-pre-wrap text-sm">{allegations}</p>
                    </div>
                )}

                {(citedMemos.length > 0 || citedDiscipline.length > 0) ? (
                    <div className="relative border border-slate-400 rounded-md p-5 pt-6 mt-8">
                         <div className="absolute -top-3 left-4 bg-slate-900 text-white text-[10px] font-bold px-3 py-1 rounded uppercase tracking-wider">
                            CITED OFFENSES
                        </div>
                        {citedMemos.map(memo => (
                             <div key={memo.id} className="mb-4">
                                <p className="font-bold underline text-sm">{memo.title}</p>
                                <div className="prose prose-sm max-w-none mt-1 whitespace-normal" dangerouslySetInnerHTML={{ __html: memo.body }} />
                            </div>
                        ))}
                        {citedDiscipline.map(entry => (
                            <div key={entry.id} className="mb-2 text-sm">
                                <p className="font-bold text-slate-800">{entry.category.toUpperCase()} - {entry.code}</p>
                                <p className="text-gray-700">{entry.description}</p>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="relative border border-slate-400 rounded-md p-5 pt-6 mt-8">
                        <div className="absolute -top-3 left-4 bg-slate-900 text-white text-[10px] font-bold px-3 py-1 rounded uppercase tracking-wider">
                            DETAILED ALLEGATIONS
                        </div>
                        <p className="italic text-gray-400 text-sm">[No offenses cited]</p>
                    </div>
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
        <div className="relative bg-white text-slate-800 font-sans text-sm leading-relaxed shadow-lg mx-auto overflow-hidden flex flex-col" style={{ width: '8.5in', minHeight: '11in' }}>
            


            {/* Header Area */}
            <div className="relative z-10 flex items-center justify-between pt-8 px-10 pb-6">
                <div className="flex items-center gap-6">
                    <div className="relative flex items-center justify-center w-16 h-20 bg-[#1e293b] text-white" 
                         style={{ clipPath: 'polygon(0 0, 100% 0, 100% 75%, 50% 100%, 0 75%)' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-[#1e293b]">NOTICE TO EXPLAIN</h1>
                </div>
                
                <div className="bg-gray-100 rounded-md px-4 py-2 text-right border border-gray-200">
                    <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">NTE CODE</div>
                    <div className="font-bold text-slate-800">{nteNumber}</div>
                </div>
            </div>

            <div className="px-10 z-10">
                <div className="w-full border-b-[3px] border-gray-200 mb-8"></div>
            </div>

            {/* Main Content */}
            <div className="px-10 z-10 flex-grow">
                
                <div className="flex justify-between items-start gap-8">
                    <div className="w-2/3">
                        {/* Employee Info */}
                        <table className="w-full mb-4 text-[13px]">
                            <tbody>
                                <tr>
                                    <td className="uppercase w-32 py-1 font-semibold text-[#1e293b]">TO</td>
                                    <td className="w-4 py-1 text-gray-500">:</td>
                                    <td className="font-bold py-1 text-slate-800">{employeeName || '[Employee Name]'}</td>
                                </tr>
                                <tr>
                                    <td className="uppercase py-1 font-semibold text-[#1e293b]">POSITION</td>
                                    <td className="py-1 text-gray-500">:</td>
                                    <td className="font-bold py-1 text-slate-800">{employeePosition || '[Employee Position]'}</td>
                                </tr>
                                <tr>
                                    <td className="uppercase py-1 font-semibold text-[#1e293b]">DEPARTMENT</td>
                                    <td className="py-1 text-gray-500">:</td>
                                    <td className="font-bold py-1 text-slate-800">{employeeDepartment || '[Employee Department]'}</td>
                                </tr>
                            </tbody>
                        </table>

                        <div className="w-1/2 border-b border-gray-300 mb-4"></div>

                        {/* Meta Info */}
                        <table className="w-full mb-8 text-[13px]">
                            <tbody>
                                <tr>
                                    <td className="uppercase w-32 py-1 font-semibold text-[#1e293b]">FROM</td>
                                    <td className="w-4 py-1 text-gray-500">:</td>
                                    <td className="font-bold py-1 text-slate-800">{template.from}</td>
                                </tr>
                                <tr>
                                    <td className="uppercase py-1 font-semibold text-[#1e293b]">DATE ISSUED</td>
                                    <td className="py-1 text-gray-500">:</td>
                                    <td className="font-bold py-1 text-slate-800">{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</td>
                                </tr>
                                <tr>
                                    <td className="uppercase py-1 font-semibold text-[#1e293b]">CC</td>
                                    <td className="py-1 text-gray-500">:</td>
                                    <td className="font-bold py-1 text-slate-800">{template.cc}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Right Side: Logo */}
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

                {/* Subject Header */}
                <div className="bg-gray-100 border-l-4 border-[#1e293b] flex items-center px-4 py-2 mb-8">
                    <div className="w-28 uppercase font-bold text-[#1e293b] text-[13px]">SUBJECT</div>
                    <div className="w-4 text-gray-500 text-[13px]">:</div>
                    <div className="font-extrabold uppercase text-[#1e293b] text-[13px]">{template.subject}</div>
                </div>

                {/* Body Text */}
                <div className="space-y-4 text-[13px] leading-relaxed">
                    {processBody(template.body).split('{{offenses_list}}').map((part, index) => (
                        <React.Fragment key={index}>
                            <div className="prose prose-sm max-w-none text-slate-800" dangerouslySetInnerHTML={{ __html: part }} />
                            {index === 0 && renderOffenses()}
                        </React.Fragment>
                    ))}
                </div>
                
                {evidenceUrl && (
                    <div className="mt-8 border-t border-gray-200 pt-6 text-[13px]">
                        <strong className="text-[#1e293b]">Supporting Documents / Evidence:</strong><br />
                        <a href={formatExternalUrl(evidenceUrl)} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-all">{evidenceUrl}</a>
                    </div>
                )}

                <div className="mt-8 text-[13px]">
                    <p>For your guidance and compliance.</p>
                </div>
                
                <div className="mt-8">
                    {template.signatorySignatureUrl && (
                        <img 
                            src={template.signatorySignatureUrl} 
                            alt="Signature" 
                            className="h-16 mb-2 object-contain" 
                            style={{ display: 'block' }}
                        />
                    )}
                    <div className="w-48 border-b border-gray-400 mb-1"></div>
                    <p className="font-bold text-[#1e293b] text-[13px] uppercase">{template.signatoryName}</p>
                    <p className="text-[12px] text-gray-600">{template.signatoryTitle}</p>
                </div>
                
                <div className="mt-16 mb-20">
                    <div className="flex items-center mb-6">
                        <div className="flex-grow border-t border-gray-300"></div>
                        <span className="mx-4 text-xs font-bold text-[#1e293b] uppercase tracking-wider">ACKNOWLEDGEMENT RECEIPT OF NOTICE</span>
                        <div className="flex-grow border-t border-gray-300"></div>
                    </div>
                    
                    <p className="text-[13px] mb-12">I hereby acknowledge receipt of this Notice to Explain.</p>
                    
                    <div className="flex justify-between gap-12">
                        <div className="w-1/2">
                            <div className="border-b border-gray-400 w-full mb-2"></div>
                            <div className="text-[11px] text-gray-500 italic px-2">Signature over Printed Name</div>
                            
                            <div className="border-b border-gray-400 w-1/2 mt-8 mb-2"></div>
                            <div className="text-[11px] text-gray-500 italic px-2">Time</div>
                        </div>
                        <div className="w-1/3">
                            <div className="border-b border-gray-400 w-full mb-2"></div>
                            <div className="text-[11px] text-gray-500 italic px-2 text-center">Date</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer Graphic */}
            <div className="relative mt-auto h-8 bg-[#1e293b] w-full"
                 style={{ clipPath: 'polygon(0 0, 85% 0, 90% 100%, 0 100%)' }}>
            </div>
            <div className="absolute bottom-0 right-0 h-8 w-[15%] bg-gray-300"
                 style={{ clipPath: 'polygon(0 0, 20% 0, 100% 100%, 0 100%)' }}>
            </div>

        </div>
    );
};

export default NTEPreview;
