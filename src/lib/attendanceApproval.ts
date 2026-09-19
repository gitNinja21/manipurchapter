export const APPROVAL_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

export type ApprovalStatus = (typeof APPROVAL_STATUS)[keyof typeof APPROVAL_STATUS];

export function isApprovalStatus(value: unknown): value is ApprovalStatus {
  return value === "PENDING" || value === "APPROVED" || value === "REJECTED";
}

/** Completed shifts count automatically; preserve explicit historical exclusions. */
export function countsForPayroll(record: {
  clockInAt?: Date | string | null;
  clockOutAt?: Date | string | null;
  approvalStatus?: string;
}) {
  return !!record.clockInAt && !!record.clockOutAt &&
    (record.approvalStatus === "PENDING" || record.approvalStatus === "APPROVED");
}
