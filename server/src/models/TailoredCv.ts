import { Schema, model, type Types } from 'mongoose';
import {
  EMPHASES,
  GENERATORS,
  analysisSchema,
  cvContentSchema,
  type Analysis,
  type CvContent,
  type Job,
} from '../schemas.js';

export interface TailoredCvDoc {
  ownerId: Types.ObjectId;
  job: Job;
  content: CvContent;
  analysis: Analysis;
  generatedBy: (typeof GENERATORS)[number];
  aiModel: string;
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
    emphasis: { type: String, enum: EMPHASES, default: 'General IT' },
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
  },
  { timestamps: true, minimize: false },
);

schema.index({ ownerId: 1, createdAt: -1 });

export const TailoredCv = model<TailoredCvDoc>('TailoredCv', schema);
