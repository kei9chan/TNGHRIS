
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Offer, Permission, OfferStatus, Application, User, Role, ApplicationStage, Candidate, JobRequisition, BusinessUnit, Department, OfferTemplate, InterviewRatingRecord } from '../../types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { usePermissions } from '../../hooks/usePermissions';
import { useAuth } from '../../hooks/useAuth';
import { useSettings } from '../../context/SettingsContext';
import EditableDescription from '../../components/ui/EditableDescription';
import OfferTable, { EnrichedOffer, offerStatusLabel } from '../../components/recruitment/OfferTable';
import OfferCreationDrawer from '../../components/recruitment/OfferCreationDrawer';
import OfferDetailModal from '../../components/recruitment/OfferDetailModal';
import { logActivity } from '../../services/auditService';
import { supabase } from '../../services/supabaseClient';
import OfferTemplatePicker from '../../components/recruitment/OfferTemplatePicker';
import { mapOfferTemplate } from './OfferTemplates';
import { fetchRatingRecordsForCandidate } from '../../services/interviewRatingService';
import OfferApprovalPackageModal from '../../components/recruitment/OfferApprovalPackageModal';
import { candidateOfferUrl, saveOfferDraft, sendApprovedOffer } from '../../services/jobOfferWorkspaceService';
import { mapJobOfferRow } from '../../services/jobOfferMapper';


const Offers: React.FC = () => {
  const { can } = usePermissions();
  const { user } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [offers, setOffers] = useState<Offer[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [requisitions, setRequisitions] = useState<JobRequisition[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [businessUnitLogos, setBusinessUnitLogos] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isCreationDrawerOpen, setIsCreationDrawerOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<EnrichedOffer | null>(null);
  const [editingOffer, setEditingOffer] = useState<EnrichedOffer | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [templates, setTemplates] = useState<OfferTemplate[]>([]);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [initialTemplate, setInitialTemplate] = useState<OfferTemplate | null>(null);
  const [businessUnitFilter, setBusinessUnitFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [approvalPackage, setApprovalPackage] = useState<{ offer: EnrichedOffer; candidate: Candidate; application: Application; ratings: InterviewRatingRecord[] } | null>(null);

  const canManage = can('Offers', Permission.Manage);
  const canView = can('Offers', Permission.View) || canManage;

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [offRes, appRes, candRes, reqRes, deptRes, buRes, themeRes, templateRes] = await Promise.all([
        supabase.from('job_offers').select('*').order('created_at', { ascending: false }),
        supabase.from('job_applications').select('*'),
        supabase.from('job_candidates').select('*'),
        supabase.from('job_requisitions').select('*'),
        supabase.from('departments').select('id,name,business_unit_id'),
        supabase.from('business_units').select('id,name'),
        supabase.from('applicant_page_themes').select('business_unit_id,logo_url').not('business_unit_id', 'is', null).order('updated_at', { ascending: false }),
        supabase.from('job_offer_templates').select('*').neq('status', 'Archived').order('updated_at', { ascending: false }),
      ]);
      if (offRes.error) throw offRes.error;
      if (appRes.error) throw appRes.error;
      if (candRes.error) throw candRes.error;
      if (reqRes.error) throw reqRes.error;
      if (deptRes.error) throw deptRes.error;
      if (buRes.error) throw buRes.error;

      setOffers((offRes.data || []).map(mapJobOfferRow));
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
        roleId: a.role_id || undefined,
        roleSlug: a.role_slug || undefined,
        roleTitleSnapshot: a.role_title_snapshot || undefined,
        departmentSnapshot: a.department_snapshot || undefined,
        locationSnapshot: a.location_snapshot || undefined,
        employmentTypeSnapshot: a.employment_type_snapshot || undefined,
        workArrangementSnapshot: a.work_arrangement_snapshot || undefined,
        roleAnswers: a.role_answers || undefined,
        sourceApplicationPage: a.source_application_page || undefined,
        applicationReference: a.application_reference || undefined,
        submissionToken: a.submission_token || undefined,
        resumeLink: a.resume_link || a.resume_url || undefined,
        resumeFileUrl: a.resume_file_url || undefined,
        resumeFilePath: a.resume_file_path || undefined,
        coverLetter: a.cover_letter || undefined,
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
        currentCity: c.current_city || undefined,
        currentEmployer: c.current_employer || undefined,
        yearsRelevantExperience: c.years_relevant_experience || undefined,
        earliestStartDate: c.earliest_start_date || undefined,
        linkedinUrl: c.linkedin_url || undefined,
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
      if (!themeRes.error) {
        setBusinessUnitLogos((themeRes.data || []).reduce((logos: Record<string, string>, row: any) => {
          if (row.business_unit_id && row.logo_url && !logos[row.business_unit_id]) logos[row.business_unit_id] = row.logo_url;
          return logos;
        }, {}));
      }
      if (!templateRes.error) setTemplates((templateRes.data || []).map(mapOfferTemplate));
    } catch (err) {
      console.error('Failed to load offers', err);
      alert('Failed to load offers.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadOffers = useCallback(async () => {
    const { data, error } = await supabase.from('job_offers').select('*').order('created_at', { ascending: false });
    if (!error) setOffers((data || []).map(mapJobOfferRow));
  }, []);

  useEffect(() => {
    if (!canView) return;
    const channel = supabase.channel('recruitment-offer-statuses').on('postgres_changes', { event: '*', schema: 'public', table: 'job_offers' }, () => { void loadOffers(); }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [canView, loadOffers]);

  useEffect(() => {
    const templateId = searchParams.get('template');
    if (!templateId || !templates.length) return;
    const template = templates.find(item => item.id === templateId);
    if (template) { setInitialTemplate(template); setTemplatePickerOpen(true); }
  }, [searchParams, templates]);

  const enrichedOffers: EnrichedOffer[] = useMemo(() => {
    return offers.map(offer => {
      const application = applications.find(app => app.id === offer.applicationId);
      const candidate = candidates.find(c => c.id === application?.candidateId);
      const requisition = requisitions.find(r => r.id === application?.requisitionId);
      return {
        ...offer,
        candidateName: candidate ? `${candidate.firstName} ${candidate.lastName}` : 'N/A',
        candidateEmail: candidate?.email,
        jobTitle: requisition?.title || 'N/A',
        businessUnitId: requisition?.businessUnitId,
        businessUnitName: businessUnits.find(unit => unit.id === requisition?.businessUnitId)?.name || offer.offerDetails?.businessUnit || '—',
        departmentName: departments.find(department => department.id === requisition?.departmentId)?.name || offer.offerDetails?.department || '—',
      };
    }).sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  }, [offers, applications, candidates, requisitions, businessUnits, departments]);

  const filteredOffers = useMemo(() => enrichedOffers.filter(offer => {
    const matchesUnit = businessUnitFilter === 'all' || offer.businessUnitId === businessUnitFilter;
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === OfferStatus.AcceptedAndSigned && [OfferStatus.Signed, OfferStatus.AcceptedAndSigned].includes(offer.status))
      || offer.status === statusFilter;
    return matchesUnit && matchesStatus;
  }), [enrichedOffers, businessUnitFilter, statusFilter]);

  const handleOpenModal = (offer: EnrichedOffer | null) => {
    if (offer) {
      setSelectedOffer(offer);
      setIsDetailModalOpen(true);
    } else {
      setSelectedOffer(null);
      setEditingOffer(null);
      setIsCreationDrawerOpen(true);
    }
  };

  const handleCloseModals = () => {
    setIsCreationDrawerOpen(false);
    setIsDetailModalOpen(false);
    setSelectedOffer(null);
    setEditingOffer(null);
  };

  const handleRequestOfferApproval = async (offer: Offer) => {
    const application = applications.find(item => item.id === offer.applicationId);
    const candidate = candidates.find(item => item.id === application?.candidateId);
    const requisition = requisitions.find(item => item.id === application?.requisitionId);
    if (!application || !candidate) {
      setSuccessMessage('The candidate or application record could not be found for this offer.');
      return;
    }
    try {
      const allRatings = await fetchRatingRecordsForCandidate(candidate.id);
      setApprovalPackage({ offer: {
        ...offer,
        candidateName: `${candidate.firstName} ${candidate.lastName}`,
        candidateEmail: candidate.email,
        jobTitle: requisition?.title || offer.offerDetails?.jobTitle || 'N/A',
        businessUnitId: requisition?.businessUnitId,
        businessUnitName: businessUnits.find(unit => unit.id === requisition?.businessUnitId)?.name || offer.offerDetails?.businessUnit || '—',
        departmentName: departments.find(department => department.id === requisition?.departmentId)?.name || offer.offerDetails?.department || '—',
      }, candidate, application, ratings: allRatings.filter(rating => rating.applicationId === application.id) });
    } catch (error: any) {
      setSuccessMessage(error?.message || 'Unable to load interview ratings for this candidate.');
      setTimeout(() => setSuccessMessage(''), 5000);
    }
  };

  const handleSaveOffer = async (offerToSave: Offer): Promise<Offer> => {
    try {
      const result = await saveOfferDraft(offerToSave, user?.id);
      setOffers(previous => previous.some(item => item.id === result.offer.id) ? previous.map(item => item.id === result.offer.id ? result.offer : item) : [result.offer, ...previous]);
      await logActivity(user, result.created ? 'CREATE' : 'UPDATE', 'Offer', result.offer.id, `${result.created ? 'Created' : 'Updated'} offer ${result.offer.offerNumber}`);
      return result.offer;
    } catch (err) {
      console.error('Failed to save offer', err);
      throw err;
    }
  };

  const handleSendOffer = async (offerToSend: Offer, recipient: string, subject: string, message: string, previewHtml: string): Promise<Offer> => {
    if (!canManage) throw new Error('You do not have permission to send offers.');
    const result = await sendApprovedOffer({ offer: offerToSend, userId: user?.id, recipient, subject, message, previewHtml });
    setOffers(previous => previous.map(item => item.id === result.offer.id ? result.offer : item));
    await logActivity(user, 'UPDATE', 'Offer', result.offer.id, result.provider ? `Sent offer ${result.offer.offerNumber} to ${recipient} through ${result.provider}` : `Activated secure link for ${result.offer.offerNumber}; email delivery failed`);
    setSuccessMessage(result.provider ? `Offer sent successfully to ${recipient}.` : 'The secure offer link is live, but the email could not be delivered. Copy the link from View Details and retry sending after the Google email connection is updated.');
    setTimeout(() => setSuccessMessage(''), 5000);
    return result.offer;
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
          <div className="flex gap-2"><Button variant="secondary" onClick={() => navigate('/recruitment/offer-templates')}>Offer Templates</Button><Button onClick={() => { setInitialTemplate(null); setTemplatePickerOpen(true); }}>Create Offer</Button></div>
        )}
      </div>
      {!canView && (
        <Card><div className="p-6 text-gray-600 dark:text-gray-300">You do not have permission to view offers.</div></Card>
      )}
      {canView && (
        <>
          <EditableDescription descriptionKey="recruitmentOffersDesc" />

          <Card><div className="space-y-4 p-4 sm:p-5"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Business unit</p><div className="mt-2 flex flex-wrap gap-2"><button onClick={() => setBusinessUnitFilter('all')} className={`rounded-full border px-4 py-2 text-sm font-semibold ${businessUnitFilter === 'all' ? 'border-violet-600 bg-violet-600 text-white' : 'bg-white text-slate-700'}`}>All Business Units</button>{businessUnits.map(unit => <button key={unit.id} onClick={() => setBusinessUnitFilter(unit.id)} className={`rounded-full border px-4 py-2 text-sm font-semibold ${businessUnitFilter === unit.id ? 'border-violet-600 bg-violet-600 text-white' : 'bg-white text-slate-700'}`}>{unit.name}</button>)}</div></div><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Offer status</p><div className="mt-2 flex flex-wrap gap-2">{['all', OfferStatus.Draft, OfferStatus.Sent, OfferStatus.Viewed, OfferStatus.AcceptedAndSigned, OfferStatus.Declined, OfferStatus.Expired].map(status => <button key={status} onClick={() => setStatusFilter(status)} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${statusFilter === status ? 'border-slate-900 bg-slate-900 text-white' : 'bg-white text-slate-700'}`}>{status === 'all' ? 'All Statuses' : offerStatusLabel(status)}</button>)}</div></div></div></Card>

          {successMessage && (
            <div className="p-4 rounded-md bg-green-50 dark:bg-green-900/40 border border-green-400 dark:border-green-800">
              <p className="text-sm text-green-700 dark:text-green-200">{successMessage}</p>
            </div>
          )}

          <Card>
            {isLoading ? <div className="p-6 text-gray-500">Loading offers...</div> : <OfferTable offers={filteredOffers} onViewDetails={handleOpenModal} onEditDraft={offer => { setEditingOffer(offer); setSelectedOffer(null); setIsDetailModalOpen(false); setIsCreationDrawerOpen(true); }} onOpenLive={offer => window.open(candidateOfferUrl(offer), '_blank', 'noopener,noreferrer')} />}
          </Card>

          {isCreationDrawerOpen && (
            <OfferCreationDrawer
              isOpen={isCreationDrawerOpen}
              onClose={handleCloseModals}
              onSave={handleSaveOffer}
              onSend={handleSendOffer}
              applications={applications}
              candidates={candidates}
              requisitions={requisitions}
              businessUnits={businessUnits}
              departments={departments}
              businessUnitLogos={businessUnitLogos}
              initialOffer={editingOffer}
              initialTemplate={initialTemplate}
              onRequestApproval={offer => void handleRequestOfferApproval(offer)}
            />
          )}
          <OfferTemplatePicker open={templatePickerOpen} templates={templates} onClose={() => { setTemplatePickerOpen(false); setSearchParams({}); }} onContinue={template => { setInitialTemplate(template); setEditingOffer(null); setSelectedOffer(null); setTemplatePickerOpen(false); setSearchParams({}); setIsCreationDrawerOpen(true); }}/>

          {isDetailModalOpen && selectedOffer && (
            <OfferDetailModal
              isOpen={isDetailModalOpen}
              onClose={handleCloseModals}
              offer={selectedOffer}
              onStatusChange={handleStatusChange}
              onConvertToEmployee={handleConvertToEmployee}
              onEdit={offer => { setEditingOffer(offer); setIsDetailModalOpen(false); setIsCreationDrawerOpen(true); }}
              onSend={offer => { setEditingOffer(offer); setIsDetailModalOpen(false); setIsCreationDrawerOpen(true); }}
              onRequestApproval={offer => void handleRequestOfferApproval(offer)}
            />
          )}
          {approvalPackage && <OfferApprovalPackageModal isOpen={true} onClose={() => setApprovalPackage(null)} offer={approvalPackage.offer} candidate={approvalPackage.candidate} application={approvalPackage.application} ratings={approvalPackage.ratings} onSubmitted={requestId => { setOffers(current => current.map(item => item.id === approvalPackage.offer.id ? { ...item, approvalStatus: 'Pending Approval', approvalRequestId: requestId } : item)); setIsCreationDrawerOpen(false); setEditingOffer(null); setApprovalPackage(null); setSuccessMessage('Offer approval request submitted successfully.'); setTimeout(() => setSuccessMessage(''), 5000); }} />}
        </>
      )}
    </div>
  );
};

export default Offers;
