import { Schema, model, type Types } from 'mongoose';

/** A code the owner gives to a friend so they can create their own account. */
export interface InviteCodeDoc {
  _id: Types.ObjectId;
  code: string;
  createdBy: Types.ObjectId;
  note: string;
  maxUses: number;
  uses: number;
  revoked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<InviteCodeDoc>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    note: { type: String, default: '', trim: true, maxlength: 120 },
    maxUses: { type: Number, required: true, min: 1, max: 50 },
    uses: { type: Number, default: 0, min: 0 },
    revoked: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const InviteCode = model<InviteCodeDoc>('InviteCode', schema);
