import { Schema, model, type Types } from 'mongoose';
import {
  GENERATORS,
  analysisSchema,
  cvContentSchema,
  APPLICATION_STATUSES,
  type Analysis,
  type Application,
  type CvContent,
  type InterviewPrep,
  type Job,
} from '../schemas.js';

export interface TailoredCvDoc {
  ownerId: Types.ObjectId;
  job: Job;
  content: CvContent;
  analysis: Analysis;
  generatedBy: (typeof GENERATORS)[number];
  aiModel: string;
  coverLetter: string;
  interviewPrep?: InterviewPrep;
  application: Application & { updatedAt?: Date };
  /** Present when the owner has made a read-only link for this CV. */
  share?: { token: string; enabled: boolean; createdAt: Date };
  createdAt: Date;
  updatedAt: Date;
}

// Job application metadata, stored with the CV version it produced.
const jobSchema = new Schema<Job>(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    company: { type: String, default: '', trim: true, maxlength: 160 },
    description: { type: String, required: true, maxlength: 20_000 },
    url: { type: String, default: '', trim: true, maxlength: 600 },
    emphasis: { type: String, default: 'General', trim: true, maxlength: 80 },
    instructions: { type: String, default: '', maxlength: 2000 },
  },
  { _id: false },
);

const schema = new Schema<TailoredCvDoc>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    job: { type: jobSchema, required: true },
    content: {
      type: Schema.Types.Mixed,
      required: true,
      validate: {
        validator: (value: unknown) => cvContentSchema.safeParse(value).success,
        message: 'Invalid CV content',
      },
    },
    analysis: {
      type: Schema.Types.Mixed,
      required: true,
      validate: {
        validator: (value: unknown) => analysisSchema.safeParse(value).success,
        message: 'Invalid analysis',
      },
    },
    generatedBy: { type: String, enum: GENERATORS, required: true },
    aiModel: { type: String, default: '', maxlength: 120 },
    coverLetter: { type: String, default: '', maxlength: 8000 },
    interviewPrep: { type: Schema.Types.Mixed },
    application: {
      status: { type: String, enum: APPLICATION_STATUSES, default: 'not_applied' },
      appliedAt: { type: String, default: '' },
      notes: { type: String, default: '', maxlength: 2000 },
      updatedAt: { type: Date },
    },
    share: {
      token: { type: String },
      enabled: { type: Boolean, default: false },
      createdAt: { type: Date },
    },
  },
  { timestamps: true, minimize: false },
);

schema.index({ ownerId: 1, createdAt: -1 });
// Shared links are looked up by token; most CVs have none.
schema.index({ 'share.token': 1 }, { unique: true, sparse: true });

export const TailoredCv = model<TailoredCvDoc>('TailoredCv', schema);
