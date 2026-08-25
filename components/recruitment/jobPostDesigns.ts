import { cloneTemplate, JobPostTemplateRecord } from './jobPostTemplatePresets';

export type JobPostDesignRow = {
  id: string;
  source_template_id?: string | null;
  name: string;
  business_unit?: string | null;
  job_title: string;
  status: 'Draft' | 'Ready' | 'Archived' | string;
  design_data: Record<string, unknown>;
  created_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type JobPostDesign = {
  id: string;
  sourceTemplateId?: string;
  name: string;
  businessUnit: string;
  jobTitle: string;
  status: string;
  template: JobPostTemplateRecord;
  createdByUserId?: string;
  createdAt: Date;
  updatedAt: Date;
};

export const createJobPostDesignTemplate = (template: JobPostTemplateRecord): JobPostTemplateRecord => ({
  ...cloneTemplate(template),
  id: '',
  name: `${template.jobTitle || template.name} — Job Post`,
  templateKey: undefined,
  isStarter: false,
  status: 'Draft',
  persisted: false,
  updatedAt: new Date(),
});

export const toJobPostDesignSnapshot = (template: JobPostTemplateRecord) => ({
  ...cloneTemplate(template),
  id: undefined,
  templateKey: undefined,
  isStarter: false,
  persisted: false,
  updatedAt: new Date().toISOString(),
});

export const mapJobPostDesign = (row: JobPostDesignRow): JobPostDesign => {
  const snapshot = (row.design_data || {}) as unknown as JobPostTemplateRecord;
  const template: JobPostTemplateRecord = {
    ...cloneTemplate(snapshot),
    id: row.id,
    name: row.name,
    businessUnit: row.business_unit || snapshot.businessUnit || '',
    jobTitle: row.job_title || snapshot.jobTitle || '',
    status: row.status || 'Draft',
    templateKey: undefined,
    isStarter: false,
    persisted: true,
    createdBy: row.created_by_user_id || snapshot.createdBy || 'HR',
    updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
  };
  return {
    id: row.id,
    sourceTemplateId: row.source_template_id || undefined,
    name: row.name,
    businessUnit: row.business_unit || '',
    jobTitle: row.job_title,
    status: row.status,
    template,
    createdByUserId: row.created_by_user_id || undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
};

export const jobPostDesignPayload = (
  template: JobPostTemplateRecord,
  sourceTemplateId?: string,
  userId?: string | null,
) => ({
  source_template_id: sourceTemplateId || null,
  name: template.name.trim(),
  business_unit: template.businessUnit?.trim() || null,
  job_title: template.jobTitle.trim(),
  status: template.status === 'Archived' ? 'Archived' : template.status === 'Ready' || template.status === 'Published' ? 'Ready' : 'Draft',
  design_data: toJobPostDesignSnapshot(template),
  created_by_user_id: userId || null,
});
