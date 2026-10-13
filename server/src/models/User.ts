import { Schema, model } from 'mongoose';

// Single-owner MVP: exactly one document (username "owner"). Every other collection
// references it through ownerId, so moving to real multi-user accounts later is additive.
const userSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, maxlength: 60 },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

export const User = model('User', userSchema);
