import React from 'react';
import { OfferStatus, Offer } from '../../types';
import Button from '../ui/Button';

export interface EnrichedOffer extends Offer {
  candidateName: string;
  jobTitle: string;
}

interface OfferTableProps {
    offers: EnrichedOffer[];
    onViewDetails: (offer: EnrichedOffer) => void;
}

const getStatusColor = (status: OfferStatus) => {
    switch (status) {
        case OfferStatus.Signed:
        case OfferStatus.Converted:
            return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
        case OfferStatus.Sent: 
            return 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300';
        case OfferStatus.Declined:
        case OfferStatus.Expired: 
            return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300';
        case OfferStatus.Draft:
        default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
};

const OfferTable: React.FC<OfferTableProps> = ({ offers, onViewDetails }) => {
    return (
         <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Offer #</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Candidate</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Job Title</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Start Date</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Base Pay</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                        <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {offers.map(offer => (
                        <tr key={offer.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500 dark:text-gray-400">{offer.offerNumber}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{offer.candidateName}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{offer.jobTitle}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(offer.startDate).toLocaleDateString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">${offer.basePay.toLocaleString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(offer.status)}`}>
                                    {offer.status}
                                </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <Button size="sm" variant="secondary" onClick={() => onViewDetails(offer)}>View Details</Button>
                            </td>
                        </tr>
                    ))}
                    {offers.length === 0 && (
                        <tr>
                            <td colSpan={7} className="text-center py-10 text-gray-500 dark:text-gray-400">No offers found.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default OfferTable;