"use client";

// Browser-only face descriptor computation via face-api.js. Imported with a
// dynamic `import("face-api.js")` from client components only — never from
// server code — so it's never pulled into the server bundle.
//
// Model weights are loaded from a public CDN mirror of the face-api.js repo's
// `weights/` folder (verified to serve with `access-control-allow-origin: *`,
// which is required for cross-origin fetch() from the browser).
const MODEL_BASE_URL =
  "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights";

// Lessons from the earlier MediaPipe gesture-detection work, applied here:
//  - face-api's `nets` are stateless detectors (no per-call video/timestamp
//    state), so — unlike MediaPipe's HandLandmarker — a single shared
//    "models loaded" promise IS safe to reuse across mounts/concurrent calls.
//  - never monkey-patch console.* around model loading; it broke MediaPipe's
//    WASM init in a way that was very hard to diagnose, and there's no reason
//    to risk repeating that here.
//  - always guard model loading with a timeout so a stuck network request
//    surfaces as a real error instead of an infinite spinner.
let modelsPromise: Promise<void> | null = null;

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s.`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function loadFaceModels(): Promise<void> {
  if (!modelsPromise) {
    modelsPromise = withTimeout(
      (async () => {
        const faceapi = await import("face-api.js");
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_BASE_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_BASE_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_BASE_URL),
        ]);
      })(),
      20000,
      "Loading face recognition models"
    ).catch((err) => {
      // Let a failed load be retried on the next call instead of permanently
      // caching a rejected promise.
      modelsPromise = null;
      throw err;
    });
  }
  return modelsPromise;
}

/**
 * Computes a 128-entry face descriptor from an image/video/canvas element.
 * Returns null if no face was confidently detected (caller should ask the
 * person to try again — this is NOT an error, just "no face right now").
 */
export async function computeFaceDescriptor(
  input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement
): Promise<number[] | null> {
  const faceapi = await import("face-api.js");
  const result = await faceapi
    .detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 320 }))
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!result) return null;
  return Array.from(result.descriptor);
}
