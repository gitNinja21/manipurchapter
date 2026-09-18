export function validBirthday(month: unknown, day: unknown): boolean {
  if (!Number.isInteger(month) || !Number.isInteger(day)) return false;
  const m = Number(month),
    d = Number(day);
  return (
    m >= 1 &&
    m <= 12 &&
    d >= 1 &&
    d <= new Date(Date.UTC(2000, m, 0)).getUTCDate()
  );
}
export function nextBirthday(month: number, day: number, today: string) {
  let year = Number(today.slice(0, 4));
  // In non-leap years, Feb 29 birthdays are celebrated on Feb 28.
  const date = (y: number) =>
    `${y}-${String(month).padStart(2, "0")}-${String(Math.min(day, new Date(Date.UTC(y, month, 0)).getUTCDate())).padStart(2, "0")}`;
  if (date(year) < today) year++;
  return date(year);
}
export const reactionEmoji = ["👍", "❤️", "🎉", "😂", "✅"];
