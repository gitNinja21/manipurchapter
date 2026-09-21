export const REVIEW_QUESTIONS = [
  { key: "friendliness", label: "How friendly was your server?" },
  { key: "attentiveness", label: "How attentive was your server?" },
  { key: "accuracy", label: "How accurately was your order handled?" },
  { key: "speed", label: "How was the speed of service?" },
  { key: "overall", label: "How was your overall service?" },
] as const;
export type Ratings = Record<(typeof REVIEW_QUESTIONS)[number]["key"], number>;
export function reviewScore(value: unknown): { ratings: Ratings; totalStars: number; points: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const ratings = {} as Ratings;
  for (const { key } of REVIEW_QUESTIONS) {
    const rating = input[key];
    if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) return null;
    ratings[key] = rating;
  }
  const totalStars = Object.values(ratings).reduce((sum, n) => sum + n, 0);
  return { ratings, totalStars, points: totalStars / 25 };
}
