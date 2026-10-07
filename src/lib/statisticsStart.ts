/** Production reporting starts here; pre-launch records remain available for audit. */
export const STATISTICS_START_DATE = "2026-10-01";
export function statisticsFrom(...dates: string[]) {
  return [STATISTICS_START_DATE, ...dates].sort().at(-1)!;
}
