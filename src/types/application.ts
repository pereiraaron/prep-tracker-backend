import { Document } from "mongoose";

export enum ApplicationStatus {
  Wishlist = "wishlist",
  Applied = "applied",
  Interviewing = "interviewing",
  Offer = "offer",
  Rejected = "rejected",
  Withdrawn = "withdrawn",
  Ghosted = "ghosted",
}

export enum ApplicationSource {
  Referral = "referral",
  Linkedin = "linkedin",
  CompanySite = "company_site",
  Recruiter = "recruiter",
  ColdEmail = "cold_email",
  ThirdParty = "third_party",
  Other = "other",
}

/** Terminal pipeline statuses that close an application. */
export const TERMINAL_APPLICATION_STATUSES: ApplicationStatus[] = [
  ApplicationStatus.Offer,
  ApplicationStatus.Rejected,
  ApplicationStatus.Withdrawn,
  ApplicationStatus.Ghosted,
];

export interface IThirdPartyDetails {
  company: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  portalUrl?: string;
  notes?: string;
}

export interface IOfferDetails {
  baseComp?: string;
  equity?: string;
  bonus?: string;
  deadline?: Date;
  notes?: string;
}

export interface IApplication extends Document {
  userId: string;
  company: string;
  role: string;
  status: ApplicationStatus;
  source?: ApplicationSource;
  thirdParty?: IThirdPartyDetails;
  jobUrl?: string;
  location?: string;
  salaryRange?: string;
  notes?: string;
  appliedAt?: Date;
  closedAt?: Date | null;
  starred: boolean;
  /** Lower number = higher on the board. Active apps only. */
  priority: number;
  offer?: IOfferDetails;
  /** Soft-delete / archive timestamp. Null when active. */
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
