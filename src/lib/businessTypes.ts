export const BUSINESS_TYPES = [
  "Freelancer/Consultant",
  "Agency/Studio",
  "School/Education",
  "Real Estate/Property",
  "Retail/Trade",
  "Contractor/Services",
  "Healthcare",
  "Other",
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];
