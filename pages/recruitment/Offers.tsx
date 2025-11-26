
import React, { useState, useMemo } from 'react';
import { Offer, Permission, OfferStatus, Application, User, Role, ApplicationStage } from '../../types';
import { mockOffers, mockApplications, mockUsers, mockCandidates, mockJobRequisitions, mockDepartments, mockBusinessUnits } from '../../services/mockData';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { usePermissions } from '../../hooks/usePermissions';
import { useAuth } from '../../hooks/useAuth';
import { useSettings } from '../../context/SettingsContext';
import EditableDescription from '../../components/ui/EditableDescription';
import OfferTable, { EnrichedOffer } from '../../components/recruitment/OfferTable';
import OfferCreationDrawer from '../../components/recruitment/OfferCreationDrawer';
import OfferDetailModal from '../../components/recruitment/OfferDetailModal';
import { logActivity } from '../../services/auditService';


const Offers: React.FC = () => {
  const { can } = usePermissions();
  const { user } = useAuth();
  const { settings } = useSettings();
  
  const [offers, setOffers] = useState<Offer[]>(mockOffers);
  const [isCreationDrawerOpen, setIsCreationDrawerOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<EnrichedOffer | null>(null);
  const [successMessage, setSuccessMessage] = useState('');

  const canManage = can('Offers', Permission.Manage);

  const enrichedOffers: EnrichedOffer[] = useMemo(() => {
    return offers.map(offer => {
      const application = mockApplications.find(app => app.id === offer.applicationId);
      const candidate = mockCandidates.find(c => c.id === application?.candidateId);
      const requisition = mockJobRequisitions.find(r => r.id === application?.requisitionId);
      return {
        ...offer,
        candidateName: candidate ? `${candidate.firstName} ${candidate.lastName}` : 'N/A',
        jobTitle: requisition?.title || 'N/A',
      };
    }).sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  }, [offers]);

  const handleOpenModal = (offer: EnrichedOffer | null) => {
    if (offer) {
        setSelectedOffer(offer);
        setIsDetailModalOpen(true);
    } else {
        setSelectedOffer(null);
        setIsCreationDrawerOpen(true);
    }
  };

  const handleCloseModals = () => {
    setIsCreationDrawerOpen(false);
    setIsDetailModalOpen(false);
    setSelectedOffer(null);
  };
  
  const handleSaveOffer = (offerToSave: Offer) => {
    if (offerToSave.id) {
        const updated = offers.map(o => o.id === offerToSave.id ? offerToSave : o);
        setOffers(updated);
        const mockIndex = mockOffers.findIndex(o => o.id === offerToSave.id);
        if (mockIndex > -1) mockOffers[mockIndex] = offerToSave;
        logActivity(user, 'UPDATE', 'Offer', offerToSave.id, `Updated offer for ${offerToSave.offerNumber}`);
    } else {
        const newOffer = { ...offerToSave, id: `OFFER-${Date.now()}`};
        setOffers(prev => [newOffer, ...prev]);
        mockOffers.unshift(newOffer);
        logActivity(user, 'CREATE', 'Offer', newOffer.id, `Created new offer: ${newOffer.offerNumber}`);
    }
    handleCloseModals();
  };

  const handleStatusChange = (offerId: string, newStatus: OfferStatus) => {
    const updated = offers.map(o => o.id === offerId ? { ...o, status: newStatus } : o);
    setOffers(updated);
    const mockIndex = mockOffers.findIndex(o => o.id === offerId);
    if (mockIndex > -1) mockOffers[mockIndex].status = newStatus;
    logActivity(user, 'UPDATE', 'Offer', offerId, `Updated offer status to ${newStatus}`);
  };
  
  const handleConvertToEmployee = (offer: Offer) => {
      const application = mockApplications.find(app => app.id === offer.applicationId) as Application;
      const candidate = mockCandidates.find(c => c.id === application.candidateId);
      const requisition = mockJobRequisitions.find(r => r.id === application.requisitionId);
      
      if (!candidate || !requisition) {
          alert("Error: Missing candidate or requisition data.");
          return;
      }

      const newEmployee: Partial<User> = {
          id: `emp-${Date.now()}`,
          name: `${candidate.firstName} ${candidate.lastName}`,
          email: candidate.email,
          role: Role.Employee,
          department: mockDepartments.find(d => d.id === requisition.departmentId)?.name,
          businessUnit: mockBusinessUnits.find(b => b.id === requisition.businessUnitId)?.name,
          status: 'Active',
          isPhotoEnrolled: false,
          dateHired: offer.startDate,
          position: requisition.title,
          managerId: requisition.createdByUserId, // Assume requester is manager for now
          salary: { basic: offer.basePay, deminimis: 0, reimbursable: 0 },
          monthlySalary: offer.basePay,
      };

      mockUsers.push(newEmployee as User);
      
      application.stage = ApplicationStage.Hired;
      handleStatusChange(offer.id, OfferStatus.Converted);
      
      logActivity(user, 'CREATE', 'User', newEmployee.id!, `Converted candidate to employee: ${newEmployee.name}`);

      setSuccessMessage(`${newEmployee.name} has been successfully converted to an employee and handed off to onboarding!`);
      setTimeout(() => setSuccessMessage(''), 5000);
      handleCloseModals();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Job Offers</h1>
        {canManage && (
            <Button onClick={() => handleOpenModal(null)}>Create Offer</Button>
        )}
      </div>
      <EditableDescription descriptionKey="recruitmentOffersDesc" />

      {successMessage && (
        <div className="p-4 rounded-md bg-green-50 dark:bg-green-900/40 border border-green-400 dark:border-green-800">
            <p className="text-sm text-green-700 dark:text-green-200">{successMessage}</p>
        </div>
      )}

      <Card>
        <OfferTable offers={enrichedOffers} onViewDetails={handleOpenModal} />
      </Card>
      
      {isCreationDrawerOpen && (
        <OfferCreationDrawer
            isOpen={isCreationDrawerOpen}
            onClose={handleCloseModals}
            onSave={handleSaveOffer}
        />
      )}

      {isDetailModalOpen && selectedOffer && (
        <OfferDetailModal
            isOpen={isDetailModalOpen}
            onClose={handleCloseModals}
            offer={selectedOffer}
            onStatusChange={handleStatusChange}
            onConvertToEmployee={handleConvertToEmployee}
        />
      )}
    </div>
  );
};

export default Offers;
