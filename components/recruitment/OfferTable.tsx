import React from 'react';
import { OfferStatus, Offer } from '../../types';
import Button from '../ui/Button';
import { formatPHP, offerMonthlyPay } from './offerCurrency';
import { isPublishedOffer } from '../../services/jobOfferWorkspaceService';

export interface EnrichedOffer extends Offer {
  candidateName: string;
  candidateEmail?: string;
  jobTitle: string;
  businessUnitId?: string;
  businessUnitName?: string;
  departmentName?: string;
}

export const offerStatusLabel = (status: OfferStatus | string) => [OfferStatus.Signed, OfferStatus.AcceptedAndSigned].includes(status as OfferStatus) ? 'Accepted and Signed' : status;

interface OfferTableProps {
    offers: EnrichedOffer[];
    onViewDetails: (offer: EnrichedOffer) => void;
    onEditDraft?: (offer: EnrichedOffer) => void;
    onOpenLive?: (offer: EnrichedOffer) => void;
}

const getStatusColor = (status: OfferStatus) => {
    switch (status) {
        case OfferStatus.Signed:
        case OfferStatus.AcceptedAndSigned:
        case OfferStatus.Accepted:
        case OfferStatus.Converted:
            return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
        case OfferStatus.Sent: 
        case OfferStatus.Viewed:
            return 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300';
        case OfferStatus.Declined:
        case OfferStatus.Expired: 
            return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300';
        case OfferStatus.Draft:
        default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
};

const OfferTable: React.FC<OfferTableProps> = ({ offers, onViewDetails, onEditDraft, onOpenLive }) => {
    return (
         <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Offer #</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Candidate</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Job Title</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Business Unit</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Start Date</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Base Pay</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Template</th>
                        <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {offers.map(offer => (
                        <tr key={offer.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500 dark:text-gray-400">{offer.offerNumber}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{offer.candidateName}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{offer.jobTitle}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{offer.businessUnitName || '—'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(offer.startDate).toLocaleDateString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{(() => { const pay = offerMonthlyPay(offer, offer.offerDetails); return formatPHP(pay.value, pay.specified); })()}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(offer.status)}`}>
                                    {offerStatusLabel(offer.status)}
                                </span>
                                {isPublishedOffer(offer) && offer.secureToken && <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><span className="h-2 w-2 rounded-full bg-emerald-500"/>Live</span>}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{offer.offerTemplateName || '—'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <div className="flex justify-end gap-2">{offer.status === OfferStatus.Draft && onEditDraft && <Button size="sm" onClick={() => onEditDraft(offer)}>Edit Draft</Button>}{isPublishedOffer(offer) && offer.secureToken && onOpenLive && <Button size="sm" onClick={() => onOpenLive(offer)}>Open Live Offer</Button>}<Button size="sm" variant="secondary" onClick={() => onViewDetails(offer)}>View Details</Button></div>
                            </td>
                        </tr>
                    ))}
                    {offers.length === 0 && (
                        <tr>
                            <td colSpan={9} className="text-center py-10 text-gray-500 dark:text-gray-400">No offers found for these filters.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default OfferTable;
