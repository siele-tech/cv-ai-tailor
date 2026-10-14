import { Schema, model, type Types } from 'mongoose';

export const ROLES = ['admin', 'member'] as const;
export type Role = (typeof ROLES)[number];

export interface UserDoc {
  _id: Types.ObjectId;
  /** "owner" for the app owner (signs in with APP_PASSWORD); the email address for invited members. */
  username: string;
  name: string;
  role: Role;
  /** scrypt hash for members; empty for the owner, whose password lives in the environment. */
  passwordHash: string;
  disabled: boolean;
  lastLoginAt?: Date;
  /** Preferred CV structure (section order and heading names). Parsed with parseLayout() on read. */
  layout?: unknown;
  /** AI requests made today, for the per-person daily limit. */
  aiUsage?: { date: string; count: number };
  invitedWith?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDoc>(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 160 },
    name: { type: String, default: '', trim: true, maxlength: 120 },
    role: { type: String, enum: ROLES, default: 'member' },
    passwordHash: { type: String, default: '' },
    disabled: { type: Boolean, default: false },
    lastLoginAt: { type: Date },
    layout: { type: Schema.Types.Mixed },
    aiUsage: {
      date: { type: String },
      count: { type: Number, default: 0 },
    },
    invitedWith: { type: String, default: '' },
  },
  { timestamps: true },
);

export const User = model<UserDoc>('User', userSchema);
