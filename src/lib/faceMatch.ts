// Pure-JS server-side face descriptor comparison — deliberately zero native
// dependencies (no `canvas`, no node bindings). The actual descriptor
// computation (128-entry embedding) happens client-side in the browser via
// face-api.js; the server only ever receives plain number arrays and does
// simple math on them. This keeps the server free of the native-binary
// footguns we hit earlier with Prisma engines / lightningcss.

// face-api.js's own recognized-as-a-match threshold is a euclidean distance
// of 0.6 between two descriptors of the same face. We use the same value.
export const FACE_MATCH_THRESHOLD = 0.6;

export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export function isFaceMatch(distance: number): boolean {
  return distance <= FACE_MATCH_THRESHOLD;
}

/** Parses a descriptor stored as a JSON string (or accepts an already-parsed array). Returns null if invalid. */
export function parseDescriptor(value: string | null | undefined): number[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((n) => typeof n === "number")) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function serializeDescriptor(descriptor: number[]): string {
  return JSON.stringify(descriptor);
}
