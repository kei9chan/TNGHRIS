import React from 'react';
import { EnrichedOffer } from './OfferTable';
import { Offer, OfferStatus, Permission } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { usePermissions } from '../../hooks/usePermissions';
import { useSettings } from '../../context/SettingsContext';

interface OfferDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  offer: EnrichedOffer;
  onStatusChange: (offerId: string, newStatus: OfferStatus) => void;
  onConvertToEmployee: (offer: Offer) => void;
}

const DetailItem: React.FC<{label: string, value?: React.ReactNode}> = ({label, value}) => (
    <div>
        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
        <dd className="mt-1 text-sm text-gray-900 dark:text-white">{value || 'N/A'}</dd>
    </div>
);

const OfferDetailModal: React.FC<OfferDetailModalProps> = ({ isOpen, onClose, offer, onStatusChange, onConvertToEmployee }) => {
    const { can } = usePermissions();
    const { settings } = useSettings();
    const canManage = can('Offers', Permission.Manage);

    const allowances = React.useMemo(() => {
        try {
            return JSON.parse(offer.allowanceJSON);
        } catch {
            return {};
        }
    }, [offer.allowanceJSON]);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Offer Details: ${offer.offerNumber}`}
            footer={<div className="flex justify-end w-full"><Button variant="secondary" onClick={onClose}>Close</Button></div>}
            size="2xl"
        >
            <div className="space-y-6">
                <section>
                    <div className="flex justify-between items-start">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Offer for {offer.candidateName}</h3>
                        <span className={`px-2 py-1 text-sm font-semibold rounded-full bg-blue-100 text-blue-800`}>{offer.status}</span>
                    </div>
                    <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                        <DetailItem label="Position" value={offer.jobTitle} />
                        <DetailItem label="Employment Type" value={offer.employmentType} />
                        <DetailItem label="Start Date" value={new Date(offer.startDate).toLocaleDateString()} />
                        <DetailItem label="Probation Period" value={`${offer.probationMonths} months`} />
                        <DetailItem label="Base Pay (Monthly)" value={`${settings.currency} ${offer.basePay.toLocaleString()}`} />
                        <DetailItem label="Allowances" value={
                            <ul className="list-disc list-inside text-sm">
                                {Object.entries(allowances).map(([key, value]) => <li key={key}>{key}: {settings.currency} {Number(value).toLocaleString()}</li>)}
                            </ul>
                        } />
                        <div className="sm:col-span-2">
                            <h4 className="font-medium mt-2">Work Schedule</h4>
                            <p className="text-sm">{offer.workScheduleDays}, {offer.workScheduleHours} at {offer.workLocation}</p>
                        </div>
                        <div className="sm:col-span-2">
                            <h4 className="font-medium mt-2">Company Benefits</h4>
                            <div className="prose prose-sm dark:prose-invert" dangerouslySetInnerHTML={{ __html: offer.companyBenefits || ''}} />
                        </div>

                    </dl>
                </section>
                
                {offer.status === OfferStatus.Sent && (
                    <section className="p-4 border-2 border-dashed rounded-lg">
                        <h3 className="text-lg font-medium text-center text-gray-900 dark:text-white">Simulated Candidate Actions</h3>
                        <div className="mt-4 flex justify-center space-x-4">
                            <Button variant="danger" onClick={() => onStatusChange(offer.id, OfferStatus.Declined)}>Decline Offer</Button>
                            <Button onClick={() => onStatusChange(offer.id, OfferStatus.Signed)}>Accept & E-Sign Offer</Button>
                        </div>
                    </section>
                )}

                {canManage && offer.status === OfferStatus.Signed && (
                     <section className="p-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg">
                        <h3 className="text-lg font-medium text-center text-gray-900 dark:text-white">Admin Actions</h3>
                        <div className="mt-4 flex flex-col items-center">
                            <p className="text-sm text-center mb-4">This offer has been signed. You can now convert this candidate into an employee, which will create their 201 file and hand them off to onboarding.</p>
                            <Button onClick={() => onConvertToEmployee(offer)}>Convert to Employee</Button>
                        </div>
                    </section>
                )}
            </div>
        </Modal>
    );
};

export default OfferDetailModal;