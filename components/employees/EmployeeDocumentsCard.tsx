import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PANStatus, NTEStatus, ResolutionStatus, PAN, NTE, Resolution, COERequest, COERequestStatus, Envelope, EnvelopeStatus } from '../../types';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { supabase } from '../../services/supabaseClient';

// This is a synthetic type for displaying various documents in one table.
interface EmployeeDocument {
    id: string;
    type: 'Personnel Action Notice' | 'Notice to Explain' | 'Notice of Decision' | 'Certificate of Employment' | 'Contract';
    dateIssued: Date;
    status: string;
    originalObject: any;
}

interface EmployeeDocumentsCardProps {
    employeeId: string;
    title: string;
    documentTypes: EmployeeDocument['type'][];
}

const getStatusChip = (type: EmployeeDocument['type'], status: string) => {
    let colorClass = 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'; // default
    if (type === 'Personnel Action Notice') {
        switch(status) {
            case PANStatus.Completed: colorClass = 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'; break;
            case PANStatus.Declined: colorClass = 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'; break;
            case PANStatus.PendingEmployee:
            case PANStatus.PendingApproval: 
            case PANStatus.PendingRecommender:
            case PANStatus.PendingEndorser:
                colorClass = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'; break;
        }
    } else if (type === 'Notice to Explain') {
         switch(status) {
            case NTEStatus.Closed: colorClass = 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'; break;
            case NTEStatus.Issued: colorClass = 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'; break;
            case NTEStatus.ResponseSubmitted: colorClass = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'; break;
        }
    } else if (type === 'Notice of Decision') {
        switch(status) {
            case ResolutionStatus.Approved:
            case ResolutionStatus.Acknowledged: 
                colorClass = 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'; break;
            case ResolutionStatus.Rejected: colorClass = 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'; break;
            case ResolutionStatus.PendingApproval: 
            case ResolutionStatus.PendingAcknowledgement:
                colorClass = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'; break;
        }
    } else if (type === 'Certificate of Employment') {
        switch(status) {
            case COERequestStatus.Approved: colorClass = 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'; break;
            case COERequestStatus.Rejected: colorClass = 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'; break;
            case COERequestStatus.Pending: colorClass = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'; break;
        }
    } else if (type === 'Contract') {
        switch(status) {
            case EnvelopeStatus.Completed: colorClass = 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'; break;
            case EnvelopeStatus.Declined:
            case EnvelopeStatus.Voided: colorClass = 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'; break;
            case EnvelopeStatus.OutForSignature:
            case EnvelopeStatus.PendingApproval: colorClass = 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300'; break;
            case EnvelopeStatus.Draft: colorClass = 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'; break;
        }
    }
    return <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${colorClass}`}>{status}</span>;
}


const EmployeeDocumentsCard: React.FC<EmployeeDocumentsCardProps> = ({ employeeId, title, documentTypes }) => {
    const navigate = useNavigate();
    const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        const fetchDocs = async () => {
            setLoading(true);
            const allDocs: EmployeeDocument[] = [];
            
            try {
                if (documentTypes.includes('Personnel Action Notice')) {
                    const { data } = await supabase.from('personnel_action_notices').select('*').eq('employee_id', employeeId);
                    (data || []).forEach(pan => {
                        allDocs.push({
                            id: pan.id,
                            type: 'Personnel Action Notice',
                            dateIssued: pan.effective_date ? new Date(pan.effective_date) : new Date(pan.created_at),
                            status: pan.status,
                            originalObject: pan,
                        });
                    });
                }

                if (documentTypes.includes('Notice to Explain')) {
                    const { data } = await supabase.from('ntes').select('*').eq('employee_id', employeeId);
                    (data || []).forEach(nte => {
                        allDocs.push({
                            id: nte.id,
                            type: 'Notice to Explain',
                            dateIssued: nte.issued_date ? new Date(nte.issued_date) : new Date(nte.created_at),
                            status: nte.status,
                            originalObject: nte,
                        });
                    });
                }

                if (documentTypes.includes('Notice of Decision')) {
                    // Assuming incident_reports has involved_employee_ids text[]
                    const { data: incidents } = await supabase.from('incident_reports').select('id, involved_employee_ids').contains('involved_employee_ids', [employeeId]);
                    if (incidents && incidents.length > 0) {
                        const incidentIds = incidents.map(i => i.id);
                        const { data: resolutions } = await supabase.from('resolutions').select('*').in('incident_report_id', incidentIds);
                        (resolutions || []).forEach(res => {
                            allDocs.push({
                                id: res.id,
                                type: 'Notice of Decision',
                                dateIssued: res.decision_date ? new Date(res.decision_date) : new Date(res.created_at),
                                status: res.status,
                                originalObject: res,
                            });
                        });
                    }
                }

                if (documentTypes.includes('Certificate of Employment')) {
                    const { data } = await supabase.from('coe_requests').select('*').eq('employee_id', employeeId).eq('status', COERequestStatus.Approved);
                    (data || []).forEach(coe => {
                        allDocs.push({
                            id: coe.id,
                            type: 'Certificate of Employment',
                            dateIssued: coe.approved_at ? new Date(coe.approved_at) : new Date(coe.date_requested),
                            status: coe.status,
                            originalObject: coe,
                        });
                    });
                }

                if (documentTypes.includes('Contract')) {
                    const { data } = await supabase.from('envelopes').select('*').eq('employee_id', employeeId);
                    (data || []).forEach(env => {
                        allDocs.push({
                            id: env.id,
                            type: 'Contract',
                            dateIssued: env.created_at ? new Date(env.created_at) : new Date(),
                            status: env.status,
                            originalObject: env,
                        });
                    });
                }
            } catch (err) {
                console.error('Failed to fetch employee documents', err);
            }

            if (active) {
                allDocs.sort((a, b) => b.dateIssued.getTime() - a.dateIssued.getTime());
                setDocuments(allDocs);
                setLoading(false);
            }
        };

        if (employeeId && documentTypes.length > 0) {
            fetchDocs();
        } else {
            setLoading(false);
        }

        return () => { active = false; };
    }, [employeeId, documentTypes]);
    
    const handleView = async (doc: EmployeeDocument) => {
        switch(doc.type) {
            case 'Personnel Action Notice':
                // For this MVP, PANs are viewed on the main list page.
                navigate('/employees/pan');
                break;
            case 'Notice to Explain':
                navigate(`/feedback/nte/${doc.id}`);
                break;
            case 'Notice of Decision':
                const incidentId = doc.originalObject.incident_report_id || doc.originalObject.incidentReportId;
                const { data: nte } = await supabase.from('ntes').select('id').eq('incident_report_id', incidentId).eq('employee_id', employeeId).single();
                if (nte) {
                    navigate(`/feedback/nte/${nte.id}`);
                } else {
                    // Fallback to cases if no specific NTE is found
                    navigate('/feedback/cases');
                }
                break;
            case 'Certificate of Employment':
                const url = doc.originalObject.generated_document_url || doc.originalObject.generatedDocumentUrl;
                if (url) {
                    window.open(url, '_blank');
                } else {
                    alert('Certificate document is not yet available.');
                }
                break;
            case 'Contract':
                navigate(`/employees/contracts/${doc.id}`);
                break;
        }
    };


    return (
        <Card title={title}>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Document Type</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Date Issued/Effective</th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                            <th scope="col" className="relative px-4 py-3"><span className="sr-only">Actions</span></th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {loading ? (
                            <tr>
                                <td colSpan={4} className="text-center py-6 text-gray-500 dark:text-gray-400">
                                    Loading documents...
                                </td>
                            </tr>
                        ) : documents.map(doc => (
                            <tr key={`${doc.type}-${doc.id}`}>
                                <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                    {doc.type === 'Contract' ? (doc.originalObject.title || doc.type) : doc.type}
                                </td>
                                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(doc.dateIssued).toLocaleDateString()}</td>
                                <td className="px-4 py-4 whitespace-nowrap text-sm">{getStatusChip(doc.type, doc.status)}</td>
                                <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <Button size="sm" variant="secondary" onClick={() => handleView(doc)}>
                                        {doc.type === 'Certificate of Employment' ? 'Download' : 'View'}
                                    </Button>
                                </td>
                            </tr>
                        ))}
                        {!loading && documents.length === 0 && (
                            <tr>
                                <td colSpan={4} className="text-center py-6 text-gray-500 dark:text-gray-400">
                                    No documents of this type found for this employee.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </Card>
    );
};

export default EmployeeDocumentsCard;
