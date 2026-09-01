
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

  const mapOffer = useCallback((row: any): Offer => ({
    id: row.id,
    applicationId: row.application_id,
    offerNumber: row.offer_number,
    basePay: Number(row.base_pay),
    basePaySpecified: row.offer_details?.compensationEntered === true || Number(row.base_pay) > 0,
    allowanceJSON: JSON.stringify(row.allowance_json || {}),
    startDate: row.start_date ? new Date(row.start_date) : new Date(),
    probationMonths: row.probation_months ?? 0,
    employmentType: row.employment_type,
    status: row.status,
    reportingTo: row.reporting_to || '',
    jobDescription: row.job_description || '',
    offerDetails: row.offer_details || {},
    draftStep: row.draft_step || 1,
    offerExpirationDate: row.offer_expiration_date ? new Date(row.offer_expiration_date) : undefined,
    logoUrl: row.logo_url || undefined,
    logoPath: row.logo_path || undefined,
    lastSavedAt: row.last_saved_at ? new Date(row.last_saved_at) : undefined,
    sentAt: row.sent_at ? new Date(row.sent_at) : undefined,
    sentByUserId: row.sent_by_user_id || undefined,
    recipientEmail: row.recipient_email || undefined,
    emailSubject: row.email_subject || undefined,
    emailMessage: row.email_message || undefined,
    secureToken: row.secure_token || undefined,
    revision: row.revision || 1,
    viewedAt: row.viewed_at ? new Date(row.viewed_at) : undefined,
    acceptedAt: row.accepted_at ? new Date(row.accepted_at) : undefined,
    signedAt: row.signed_at ? new Date(row.signed_at) : undefined,
    declinedAt: row.declined_at ? new Date(row.declined_at) : undefined,
    declineReason: row.decline_reason || undefined,
    signatureName: row.signature_name || undefined,
    signatureType: row.signature_type || undefined,
    signaturePath: row.signature_path || undefined,
    signedPdfPath: row.signed_pdf_path || undefined,
    requireSignature: row.require_signature !== false,
    offerTemplateId: row.offer_template_id || undefined,
    offerTemplateName: row.offer_template_name || undefined,
    offerTemplateSnapshot: row.offer_template_snapshot || undefined,
    approvalStatus: row.approval_status || 'Not Requested',
    approvalRequestId: row.approval_request_id || undefined,
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
  }, [mapOffer]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!canView) return;
    const channel = supabase.channel('recruitment-offer-statuses').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'job_offers' }, () => { void loadData(); }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [canView, loadData]);

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

  const handleRequestOfferApproval = async (offer: EnrichedOffer) => {
    const application = applications.find(item => item.id === offer.applicationId);
    const candidate = candidates.find(item => item.id === application?.candidateId);
    if (!application || !candidate) {
      setSuccessMessage('The candidate or application record could not be found for this offer.');
      return;
    }
    try {
      const allRatings = await fetchRatingRecordsForCandidate(candidate.id);
      setApprovalPackage({ offer, candidate, application, ratings: allRatings.filter(rating => rating.applicationId === application.id) });
    } catch (error: any) {
      setSuccessMessage(error?.message || 'Unable to load interview ratings for this candidate.');
      setTimeout(() => setSuccessMessage(''), 5000);
    }
  };

  const handleSaveOffer = async (offerToSave: Offer): Promise<Offer> => {
    const allowanceJson = offerToSave.allowanceJSON ? JSON.parse(offerToSave.allowanceJSON) : {};
    const payload = {
      application_id: offerToSave.applicationId,
      offer_number: offerToSave.offerNumber || `OFFER-${Date.now().toString().slice(-6)}`,
      base_pay: offerToSave.basePay,
      allowance_json: allowanceJson,
      start_date: offerToSave.startDate ? new Date(offerToSave.startDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      probation_months: offerToSave.probationMonths,
      employment_type: offerToSave.employmentType,
      status: offerToSave.status,
      reporting_to: offerToSave.reportingTo || null,
      job_description: offerToSave.jobDescription || null,
      offer_details: offerToSave.offerDetails || {},
      draft_step: offerToSave.draftStep || 1,
      offer_expiration_date: offerToSave.offerExpirationDate ? new Date(offerToSave.offerExpirationDate).toISOString().slice(0, 10) : null,
      logo_url: offerToSave.logoUrl || null,
      logo_path: offerToSave.logoPath || null,
      last_saved_at: new Date().toISOString(),
      recipient_email: offerToSave.recipientEmail || null,
      email_subject: offerToSave.emailSubject || null,
      email_message: offerToSave.emailMessage || null,
      created_by_user_id: user?.id || null,
      require_signature: offerToSave.requireSignature !== false,
      offer_template_id: offerToSave.offerTemplateId || null,
      offer_template_name: offerToSave.offerTemplateName || null,
      offer_template_snapshot: offerToSave.offerTemplateSnapshot || {},
    };
    try {
      if (offerToSave.id) {
        const { data, error } = await supabase.from('job_offers').update(payload).eq('id', offerToSave.id).select().single();
        if (error) throw error;
        const mapped = mapOffer(data);
        setOffers(prev => prev.map(o => o.id === mapped.id ? mapped : o));
        logActivity(user, 'UPDATE', 'Offer', mapped.id, `Updated offer ${mapped.offerNumber}`);
        return mapped;
      } else {
        const { data: existingDraft } = await supabase.from('job_offers').select('id').eq('application_id', offerToSave.applicationId).eq('status', OfferStatus.Draft).order('updated_at', { ascending: false }).limit(1).maybeSingle();
        const request = existingDraft?.id ? supabase.from('job_offers').update(payload).eq('id', existingDraft.id) : supabase.from('job_offers').insert(payload);
        const { data, error } = await request.select().single();
        if (error) throw error;
        const mapped = mapOffer(data);
        setOffers(prev => existingDraft?.id ? prev.map(item => item.id === mapped.id ? mapped : item) : [mapped, ...prev]);
        logActivity(user, existingDraft?.id ? 'UPDATE' : 'CREATE', 'Offer', mapped.id, `${existingDraft?.id ? 'Updated' : 'Created'} offer ${mapped.offerNumber}`);
        return mapped;
      }
    } catch (err) {
      console.error('Failed to save offer', err);
      throw err;
    }
  };

  const handleSendOffer = async (offerToSend: Offer, recipient: string, subject: string, message: string, previewHtml: string): Promise<Offer> => {
    if (!canManage) throw new Error('You do not have permission to send offers.');
    if (!recipient) throw new Error('The candidate email address is missing.');
    // Persist first to obtain a stable opaque token, but keep the status Draft until email succeeds.
    const draft = await handleSaveOffer({ ...offerToSend, status: OfferStatus.Draft, recipientEmail: recipient, emailSubject: subject, emailMessage: message });
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session?.access_token) throw new Error('Your session has expired. Please sign in again.');
    const secureLink = `${window.location.origin}/offer/${draft.secureToken}`;
    const activatedAt = new Date().toISOString();
    const sendingDetails = { ...(draft.offerDetails || {}), emailDelivery: { status: 'sending', attemptedAt: activatedAt } };
    const { data: activatedRow, error: activationError } = await supabase.from('job_offers').update({ status: OfferStatus.Sent, sent_at: activatedAt, sent_by_user_id: user?.id || null, last_saved_at: activatedAt, recipient_email: recipient, email_subject: subject.trim(), email_message: message.trim(), require_signature: offerToSend.requireSignature !== false, offer_details: sendingDetails }).eq('id', draft.id).select().single();
    if (activationError || !activatedRow) throw new Error(`Unable to activate the secure offer link: ${activationError?.message || 'Unknown error'}`);
    const activatedOffer = mapOffer(activatedRow);
    setOffers(previous => previous.map(item => item.id === activatedOffer.id ? activatedOffer : item));
    const html = `${previewHtml}<p style="margin-top:24px"><a href="${secureLink}" style="background:#6d28d9;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">View and Respond to Offer</a></p><p style="color:#64748b;font-size:12px">This is a private link intended for the named recipient.</p>`;
    const { data: emailResult, error: emailError } = await supabase.functions.invoke('send-recruitment-email', {
      body: { to: recipient, subject: subject.trim(), message: `${message.trim()}\n\nReview your offer: ${secureLink}`, html, category: 'job-offer' },
    });
    let provider = emailResult?.ok ? 'google-gmail' : '';
    let deliveryError = '';
    if (!provider) {
      let googleMessage = emailResult?.error;
      if (!googleMessage) {
        try { googleMessage = (await emailError?.context?.json?.())?.error; } catch { /* response body unavailable */ }
      }
      try {
        const smtpResponse = await fetch('/api/recruitment-email', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionData.session.access_token}` }, body: JSON.stringify({ to: recipient, subject: subject.trim(), message: `${message.trim()}\n\nReview your offer: ${secureLink}`, html }) });
        const smtpBody = await smtpResponse.json().catch(() => ({}));
        if (!smtpResponse.ok) throw new Error(smtpBody?.error || `Email service returned HTTP ${smtpResponse.status}.`);
        provider = 'existing-email-service';
      } catch (smtpError: any) {
        deliveryError = [googleMessage || emailError?.message, smtpError?.message].filter(Boolean).join(' Existing email service fallback: ');
      }
    }
    const sentAt = new Date().toISOString();
    const deliveryDetails = { ...(activatedOffer.offerDetails || {}), emailDelivery: provider ? { status: 'sent', provider, attemptedAt: activatedAt, sentAt } : { status: 'failed', attemptedAt: activatedAt, error: deliveryError || 'Email delivery failed.' } };
    const { data, error } = await supabase.from('job_offers').update({ last_saved_at: sentAt, offer_details: deliveryDetails }).eq('id', draft.id).select().single();
    if (error) throw new Error(`The secure link is live, but delivery status could not be recorded: ${error.message}`);
    const mapped = mapOffer(data);
    setOffers(previous => previous.map(item => item.id === mapped.id ? mapped : item));
    await logActivity(user, 'UPDATE', 'Offer', mapped.id, provider ? `Sent offer ${mapped.offerNumber} to ${recipient} through ${provider}` : `Activated secure link for ${mapped.offerNumber}; email delivery failed`);
    setSuccessMessage(provider ? `Offer sent successfully to ${recipient}.` : 'The secure offer link is live, but the email could not be delivered. Copy the link from View Details and retry sending after the Google email connection is updated.');
    setTimeout(() => setSuccessMessage(''), 5000);
    return mapped;
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
            {isLoading ? <div className="p-6 text-gray-500">Loading offers...</div> : <OfferTable offers={filteredOffers} onViewDetails={handleOpenModal} onEditDraft={offer => { setEditingOffer(offer); setSelectedOffer(null); setIsDetailModalOpen(false); setIsCreationDrawerOpen(true); }} />}
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
          {approvalPackage && <OfferApprovalPackageModal isOpen={true} onClose={() => setApprovalPackage(null)} offer={approvalPackage.offer} candidate={approvalPackage.candidate} application={approvalPackage.application} ratings={approvalPackage.ratings} onSubmitted={requestId => { setOffers(current => current.map(item => item.id === approvalPackage.offer.id ? { ...item, approvalStatus: 'Pending Approval', approvalRequestId: requestId } : item)); setSuccessMessage('Offer approval request submitted successfully.'); setTimeout(() => setSuccessMessage(''), 5000); }} />}
        </>
      )}
    </div>
  );
};

export default Offers;
