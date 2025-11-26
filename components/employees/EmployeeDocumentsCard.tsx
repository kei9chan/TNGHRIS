
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PANStatus, NTEStatus, ResolutionStatus, PAN, NTE, Resolution, COERequest, COERequestStatus, Envelope, EnvelopeStatus } from '../../types';
import { mockPANs, mockNTEs, mockResolutions, mockIncidentReports, mockCOERequests, mockEnvelopes } from '../../services/mockData';
import Card from '../ui/Card';
import Button from '../ui/Button';

// This is a synthetic type for displaying various documents in one table.
interface EmployeeDocument {
    id: string;
    type: 'Personnel Action Notice' | 'Notice to Explain' | 'Notice of Decision' | 'Certificate of Employment' | 'Contract';
    dateIssued: Date;
    status: string;
    originalObject: PAN | NTE | Resolution | COERequest | Envelope;
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

    const documents = useMemo(() => {
        const allDocs: EmployeeDocument[] = [];

        mockPANs.filter(p => p.employeeId === employeeId).forEach(pan => {
            allDocs.push({
                id: pan.id,
                type: 'Personnel Action Notice',
                dateIssued: pan.effectiveDate,
                status: pan.status,
                originalObject: pan,
            });
        });

        mockNTEs.filter(n => n.employeeId === employeeId).forEach(nte => {
            allDocs.push({
                id: nte.id,
                type: 'Notice to Explain',
                dateIssued: nte.issuedDate,
                status: nte.status,
                originalObject: nte,
            });
        });

        mockResolutions.forEach(res => {
            const incident = mockIncidentReports.find(ir => ir.id === res.incidentReportId);
            if (incident && incident.involvedEmployeeIds.includes(employeeId)) {
                allDocs.push({
                    id: res.id,
                    type: 'Notice of Decision',
                    dateIssued: res.decisionDate,
                    status: res.status,
                    originalObject: res,
                });
            }
        });

        mockCOERequests.filter(r => r.employeeId === employeeId && r.status === COERequestStatus.Approved).forEach(coe => {
             allDocs.push({
                id: coe.id,
                type: 'Certificate of Employment',
                dateIssued: coe.approvedAt || coe.dateRequested,
                status: coe.status,
                originalObject: coe
             });
        });

        mockEnvelopes.filter(e => e.employeeId === employeeId).forEach(env => {
            allDocs.push({
                id: env.id,
                type: 'Contract',
                dateIssued: env.createdAt,
                status: env.status,
                originalObject: env,
            });
        });

        return allDocs
            .filter(doc => documentTypes.includes(doc.type))
            .sort((a, b) => new Date(b.dateIssued).getTime() - new Date(a.dateIssued).getTime());

    }, [employeeId, documentTypes]);
    
    const handleView = (doc: EmployeeDocument) => {
        switch(doc.type) {
            case 'Personnel Action Notice':
                // For this MVP, PANs are viewed on the main list page.
                navigate('/employees/pan');
                break;
            case 'Notice to Explain':
                navigate(`/feedback/nte/${doc.id}`);
                break;
            case 'Notice of Decision':
                const resolution = doc.originalObject as Resolution;
                const incident = mockIncidentReports.find(ir => ir.id === resolution.incidentReportId);
                // Find the specific NTE for this employee within the incident to provide context for the decision.
                const nte = mockNTEs.find(n => n.incidentReportId === incident?.id && n.employeeId === employeeId);
                if (nte) {
                    navigate(`/feedback/nte/${nte.id}`);
                } else {
                    // Fallback to cases if no specific NTE is found (e.g., case resolved without NTE)
                    navigate('/feedback/cases');
                }
                break;
            case 'Certificate of Employment':
                const coe = doc.originalObject as COERequest;
                // In a real app, this would trigger a file download or open a PDF viewer
                alert(`Downloading Certificate of Employment...\n\nFile: ${coe.generatedDocumentUrl || 'certificate.pdf'}`);
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
                        {documents.map(doc => (
                            <tr key={`${doc.type}-${doc.id}`}>
                                <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                    {doc.type === 'Contract' && 'originalObject' in doc ? (doc.originalObject as Envelope).title : doc.type}
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
                        {documents.length === 0 && (
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
