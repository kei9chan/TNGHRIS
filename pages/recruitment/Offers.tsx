
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Offer, Permission, OfferStatus, Application, User, Role, ApplicationStage, Candidate, JobRequisition } from '../../types';
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
import { supabase } from '../../services/supabaseClient';


const Offers: React.FC = () => {
  const { can } = usePermissions();
  const { user } = useAuth();
  const { settings } = useSettings();
  
  const [offers, setOffers] = useState<Offer[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [requisitions, setRequisitions] = useState<JobRequisition[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreationDrawerOpen, setIsCreationDrawerOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<EnrichedOffer | null>(null);
  const [successMessage, setSuccessMessage] = useState('');

  const canManage = can('Offers', Permission.Manage);
  const canView = can('Offers', Permission.View) || canManage;

  const mapOffer = useCallback((row: any): Offer => ({
    id: row.id,
    applicationId: row.application_id,
    offerNumber: row.offer_number,
    basePay: Number(row.base_pay),
    allowanceJSON: JSON.stringify(row.allowance_json || {}),
    startDate: row.start_date ? new Date(row.start_date) : new Date(),
    probationMonths: row.probation_months ?? 0,
    employmentType: row.employment_type,
    status: row.status,
    reportingTo: row.reporting_to || '',
    jobDescription: row.job_description || '',
    // Optional fields not in table
    workScheduleDays: '',
    workScheduleHours: '',
    workLocation: '',
    paymentSchedule: '',
    additionalPayInfo: '',
    companyBenefits: '',
    preEmploymentRequirements: '',
    signatoryName: '',
    signatoryPosition: '',
  }), []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [offRes, appRes, candRes, reqRes, deptRes, buRes] = await Promise.all([
        supabase.from('job_offers').select('*').order('created_at', { ascending: false }),
        supabase.from('job_applications').select('*'),
        supabase.from('job_candidates').select('*'),
        supabase.from('job_requisitions').select('*'),
        supabase.from('departments').select('id,name,business_unit_id'),
        supabase.from('business_units').select('id,name'),
      ]);
      if (offRes.error) throw offRes.error;
      if (appRes.error) throw appRes.error;
      if (candRes.error) throw candRes.error;
      if (reqRes.error) throw reqRes.error;
      if (deptRes.error) throw deptRes.error;
      if (buRes.error) throw buRes.error;

      setOffers((offRes.data || []).map(mapOffer));
      setApplications((appRes.data || []).map((a: any) => ({
        id: a.id,
        candidateId: a.candidate_id,
        jobPostId: a.job_post_id,
        requisitionId: a.requisition_id,
        stage: a.stage as ApplicationStage,
        ownerUserId: a.owner_user_id || undefined,
        createdAt: a.created_at ? new Date(a.created_at) : new Date(),
        updatedAt: a.updated_at ? new Date(a.updated_at) : new Date(),
        notes: a.notes || a.cover_letter || '',
        referrer: a.referrer || '',
      } as Application)));
      setCandidates((candRes.data || []).map((c: any) => ({
        id: c.id,
        firstName: c.first_name,
        lastName: c.last_name,
        email: c.email,
        phone: c.phone ?? '',
        source: c.source,
        tags: c.tags || [],
        portfolioUrl: c.portfolio_url || '',
        consentAt: c.consent_at ? new Date(c.consent_at) : undefined,
      } as Candidate)));
      setRequisitions((reqRes.data || []).map((r: any) => ({
        id: r.id,
        reqCode: r.req_code || '',
        title: r.title,
        departmentId: r.department_id,
        businessUnitId: r.business_unit_id,
        headcount: r.headcount,
        employmentType: r.employment_type,
        locationType: r.location_type,
        workLocation: r.work_location,
        budgetedSalaryMin: r.budgeted_salary_min,
        budgetedSalaryMax: r.budgeted_salary_max,
        justification: r.justification || '',
        createdByUserId: r.created_by_user_id || '',
        status: r.status,
        createdAt: r.created_at ? new Date(r.created_at) : new Date(),
        updatedAt: r.updated_at ? new Date(r.updated_at) : new Date(),
        isUrgent: r.is_urgent,
        routingSteps: r.routing_steps || [],
      } as JobRequisition)));
      setDepartments((deptRes.data || []).map((d: any) => ({ id: d.id, name: d.name, businessUnitId: d.business_unit_id } as Department)));
      setBusinessUnits((buRes.data || []).map((b: any) => ({ id: b.id, name: b.name } as BusinessUnit)));
    } catch (err) {
      console.error('Failed to load offers', err);
      alert('Failed to load offers.');
    } finally {
      setIsLoading(false);
    }
  }, [mapOffer]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const enrichedOffers: EnrichedOffer[] = useMemo(() => {
    return offers.map(offer => {
      const application = applications.find(app => app.id === offer.applicationId);
      const candidate = candidates.find(c => c.id === application?.candidateId);
      const requisition = requisitions.find(r => r.id === application?.requisitionId);
      return {
        ...offer,
        candidateName: candidate ? `${candidate.firstName} ${candidate.lastName}` : 'N/A',
        jobTitle: requisition?.title || 'N/A',
      };
    }).sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  }, [offers, applications, candidates, requisitions]);

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
  
  const handleSaveOffer = async (offerToSave: Offer) => {
    const allowanceJson = offerToSave.allowanceJSON ? JSON.parse(offerToSave.allowanceJSON) : {};
    const payload = {
      application_id: offerToSave.applicationId,
      offer_number: offerToSave.offerNumber || `OFFER-${Date.now().toString().slice(-6)}`,
      base_pay: offerToSave.basePay,
      allowance_json: allowanceJson,
      start_date: offerToSave.startDate,
      probation_months: offerToSave.probationMonths,
      employment_type: offerToSave.employmentType,
      status: offerToSave.status,
      reporting_to: offerToSave.reportingTo || null,
      job_description: offerToSave.jobDescription || null,
      created_by_user_id: user?.id || null,
    };
    try {
      if (offerToSave.id) {
        const { data, error } = await supabase.from('job_offers').update(payload).eq('id', offerToSave.id).select().single();
        if (error) throw error;
        const mapped = mapOffer(data);
        setOffers(prev => prev.map(o => o.id === mapped.id ? mapped : o));
        logActivity(user, 'UPDATE', 'Offer', mapped.id, `Updated offer ${mapped.offerNumber}`);
      } else {
        const { data, error } = await supabase.from('job_offers').insert(payload).select().single();
        if (error) throw error;
        const mapped = mapOffer(data);
        setOffers(prev => [mapped, ...prev]);
        logActivity(user, 'CREATE', 'Offer', mapped.id, `Created offer ${mapped.offerNumber}`);
      }
    } catch (err) {
      console.error('Failed to save offer', err);
      alert('Failed to save offer.');
    } finally {
      handleCloseModals();
    }
  };

  const handleStatusChange = async (offerId: string, newStatus: OfferStatus) => {
    try {
        const { error } = await supabase.from('job_offers').update({ status: newStatus }).eq('id', offerId);
        if (error) throw error;
        setOffers(prev => prev.map(o => o.id === offerId ? { ...o, status: newStatus } : o));
        logActivity(user, 'UPDATE', 'Offer', offerId, `Updated offer status to ${newStatus}`);
    } catch (err) {
        console.error('Failed to update status', err);
        alert('Failed to update status.');
    }
  };
  
  const handleConvertToEmployee = async (offer: Offer) => {
      const application = applications.find(app => app.id === offer.applicationId);
      const candidate = candidates.find(c => c.id === application?.candidateId);
      const requisition = requisitions.find(r => r.id === application?.requisitionId);
      
      if (!candidate || !requisition || !application) {
          alert("Error: Missing candidate or requisition data.");
          return;
      }
      try {
        await supabase.from('job_offers').update({ status: OfferStatus.Converted }).eq('id', offer.id);
        await supabase.from('job_applications').update({ stage: ApplicationStage.Hired }).eq('id', application.id);
        setOffers(prev => prev.map(o => o.id === offer.id ? { ...o, status: OfferStatus.Converted } : o));
        setApplications(prev => prev.map(a => a.id === application.id ? { ...a, stage: ApplicationStage.Hired } : a));
        logActivity(user, 'UPDATE', 'Offer', offer.id, `Converted offer for ${candidate.firstName} ${candidate.lastName}`);
        setSuccessMessage(`${candidate.firstName} ${candidate.lastName} has been marked as hired.`);
        setTimeout(() => setSuccessMessage(''), 5000);
      } catch (err) {
        console.error('Failed to convert offer', err);
        alert('Failed to convert offer.');
      } finally {
        handleCloseModals();
      }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Job Offers</h1>
        {canManage && (
            <Button onClick={() => handleOpenModal(null)}>Create Offer</Button>
        )}
      </div>
      {!canView && (
        <Card><div className="p-6 text-gray-600 dark:text-gray-300">You do not have permission to view offers.</div></Card>
      )}
      {canView && (
      <>
      <EditableDescription descriptionKey="recruitmentOffersDesc" />

      {successMessage && (
        <div className="p-4 rounded-md bg-green-50 dark:bg-green-900/40 border border-green-400 dark:border-green-800">
            <p className="text-sm text-green-700 dark:text-green-200">{successMessage}</p>
        </div>
      )}

      <Card>
        {isLoading ? <div className="p-6 text-gray-500">Loading offers...</div> : <OfferTable offers={enrichedOffers} onViewDetails={handleOpenModal} />}
      </Card>
      
      {isCreationDrawerOpen && (
        <OfferCreationDrawer
            isOpen={isCreationDrawerOpen}
            onClose={handleCloseModals}
            onSave={handleSaveOffer}
            applications={applications}
            candidates={candidates}
            requisitions={requisitions}
            businessUnits={businessUnits}
            departments={departments}
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
      </>
      )}
    </div>
  );
};

export default Offers;
