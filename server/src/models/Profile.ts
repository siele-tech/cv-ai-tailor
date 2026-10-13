import { Schema, model, type Types } from 'mongoose';
import { profileSchema, type Profile } from '../schemas.js';

export interface ProfileDoc {
  ownerId: Types.ObjectId;
  data: Profile;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ProfileDoc>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    data: {
      type: Schema.Types.Mixed,
      required: true,
      // The zod schema is the single definition of a valid profile; enforce it at the model too.
      validate: {
        validator: (value: unknown) => profileSchema.safeParse(value).success,
        message: 'Invalid master profile',
      },
    },
  },
  { timestamps: true, minimize: false },
);

export const MasterProfile = model<ProfileDoc>('MasterProfile', schema);
