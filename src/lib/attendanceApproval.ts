export const APPROVAL_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

export type ApprovalStatus = (typeof APPROVAL_STATUS)[keyof typeof APPROVAL_STATUS];

export function isApprovalStatus(value: unknown): value is ApprovalStatus {
  return value === "PENDING" || value === "APPROVED" || value === "REJECTED";
}
