import { z } from 'zod';

export const ModalitySchema = z.enum([
  'CT', 'MR', 'CR', 'DR', 'US', 'MG', 'XA', 'NM', 'PT', 'OT',
]);
export type Modality = z.infer<typeof ModalitySchema>;

export const RoleSchema = z.enum(['super_admin', 'owner', 'doctor', 'technician', 'read_only']);
export type Role = z.infer<typeof RoleSchema>;

export const ReadStatusSchema = z.enum(['unread', 'reading', 'reported', 'signed']);
export type ReadStatus = z.infer<typeof ReadStatusSchema>;

export const PatientPublicSchema = z.object({
  id: z.string().uuid(),
  mrn: z.string(),
  display_name: z.string(),
  age_at_study: z.number().int().nullable(),
  sex: z.enum(['M', 'F', 'U']).nullable(),
});
export type PatientPublic = z.infer<typeof PatientPublicSchema>;

export const StudySummarySchema = z.object({
  study_id: z.string().uuid(),
  study_uid: z.string(),
  patient: PatientPublicSchema,
  modality: ModalitySchema,
  body_part: z.string().nullable(),
  description: z.string().nullable(),
  study_date: z.string(),
  received_at: z.string(),
  triage_priority: z.number().int().min(1).max(5),
  triage_label: z.string().nullable(),
  ai_confidence: z.number().min(0).max(1).nullable(),
  read_status: ReadStatusSchema,
  assigned_doctor_id: z.string().uuid().nullable(),
  num_instances: z.number().int(),
});
export type StudySummary = z.infer<typeof StudySummarySchema>;

export const ReportDraftSchema = z.object({
  technique_ar: z.string(),
  findings_ar: z.string(),
  impression_ar: z.string(),
  recommendations_ar: z.string(),
  icd11_codes: z.array(z.string()).default([]),
});
export type ReportDraft = z.infer<typeof ReportDraftSchema>;

export const ErrorEnvelopeSchema = z.object({
  code: z.string(),
  message_ar: z.string(),
  message_en: z.string(),
  request_id: z.string(),
  details: z.record(z.unknown()).optional(),
  retryable: z.boolean().default(false),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

export const RealtimeEventSchema = z.object({
  type: z.enum(['WORKLIST_UPDATED', 'STUDY_AI_READY', 'LLM_DRAFT_READY', 'BROADCAST']),
  payload: z.record(z.unknown()),
});
export type RealtimeEvent = z.infer<typeof RealtimeEventSchema>;
