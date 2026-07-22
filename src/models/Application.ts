import { Schema, model } from "mongoose";
import {
  ApplicationSource,
  ApplicationStatus,
  IApplication,
  IOfferDetails,
  IThirdPartyDetails,
} from "../types/application";

const thirdPartySchema = new Schema<IThirdPartyDetails>(
  {
    company: { $type: String, required: true, trim: true, maxlength: 200 },
    contactName: { $type: String, trim: true, maxlength: 200 },
    contactEmail: { $type: String, trim: true, maxlength: 320 },
    contactPhone: { $type: String, trim: true, maxlength: 50 },
    portalUrl: { $type: String, trim: true, maxlength: 2000 },
    notes: { $type: String, trim: true, maxlength: 10000 },
  },
  { _id: false, typeKey: "$type" }
);

const offerSchema = new Schema<IOfferDetails>(
  {
    baseComp: { $type: String, trim: true, maxlength: 100 },
    equity: { $type: String, trim: true, maxlength: 100 },
    bonus: { $type: String, trim: true, maxlength: 100 },
    deadline: { $type: Date },
    notes: { $type: String, trim: true, maxlength: 10000 },
  },
  { _id: false, typeKey: "$type" }
);

const applicationSchema = new Schema<IApplication>(
  {
    userId: { $type: String, required: true },
    company: { $type: String, required: true, trim: true, maxlength: 200 },
    role: { $type: String, required: true, trim: true, maxlength: 200 },
    status: {
      $type: String,
      enum: Object.values(ApplicationStatus),
      default: ApplicationStatus.Wishlist,
    },
    source: {
      $type: String,
      enum: Object.values(ApplicationSource),
    },
    thirdParty: { $type: thirdPartySchema },
    jobUrl: { $type: String, trim: true, maxlength: 2000 },
    location: { $type: String, trim: true, maxlength: 200 },
    salaryRange: { $type: String, trim: true, maxlength: 100 },
    notes: { $type: String, trim: true, maxlength: 50000 },
    appliedAt: { $type: Date },
    closedAt: { $type: Date },
    starred: { $type: Boolean, default: false },
    priority: { $type: Number, default: 0 },
    offer: { $type: offerSchema },
    archivedAt: { $type: Date, default: null },
  },
  {
    timestamps: true,
    typeKey: "$type",
  }
);

applicationSchema.index({ userId: 1, status: 1, priority: 1, updatedAt: -1 });
applicationSchema.index({ userId: 1, company: 1 });
applicationSchema.index({ userId: 1, starred: 1, updatedAt: -1 });
applicationSchema.index({ userId: 1, archivedAt: 1, priority: 1 });
applicationSchema.index({ userId: 1, archivedAt: 1, status: 1, updatedAt: -1 });

export const Application = model("Application", applicationSchema);
