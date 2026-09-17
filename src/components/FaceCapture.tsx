"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Status =
  | "starting-camera"
  | "camera-error"
  | "loading-model"
  | "model-error"
  | "ready"
  | "processing"
  | "captured";

type Props = {
  /** "enroll" shows onboarding copy; "verify" shows clock-in/out copy. Behavior is identical either way. */
  mode: "enroll" | "verify";
  onCaptured: (photoDataUrl: string, descriptor: number[]) => void;
  onCancel?: () => void;
};

export default function FaceCapture({ mode, onCaptured, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const liveCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppedRef = useRef(false);

  const [status, setStatus] = useState<Status>("starting-camera");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [faceDetected, setFaceDetected] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    stoppedRef.current = true;
    if (liveCheckRef.current !== null) clearInterval(liveCheckRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Start camera
  //
  // IMPORTANT: React's dev-mode Strict Mode runs every effect through a
  // synthetic mount -> cleanup -> mount cycle once, immediately, on initial
  // mount (to help catch missing-cleanup bugs). Earlier code here paired
  // this effect with a separate `useEffect(() => () => stopCamera(), [])`
  // whose phantom cleanup set `stoppedRef.current = true` and never reset
  // it — so the *second* (real) mount silently inherited a "stopped" flag
  // that no code path ever cleared, and every later async callback's
  // `if (stoppedRef.current) return;` guard bailed out forever with no
  // visible error. (This is the same class of bug that stalled the old
  // gesture-detection camera — a stale ref surviving Strict Mode's phantom
  // unmount.) The fix: reset stoppedRef at the top of *this* effect, so
  // every real invocation (phantom or not) starts from a clean slate, and
  // only stop for good in this effect's own cleanup.
  useEffect(() => {
    stoppedRef.current = false;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus("loading-model");
      } catch {
        if (cancelled) return;
        setErrorMsg(
          "Couldn't access your camera. Please allow camera access in your browser and reload this page."
        );
        setStatus("camera-error");
      }
    })();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [stopCamera]);

  // Load face-recognition models, then start a lightweight "is a face
  // visible right now" check purely for UI feedback. The real check happens
  // fresh at capture time.
  useEffect(() => {
    if (status !== "loading-model") return;
    let cancelled = false;

    (async () => {
      try {
        const { loadFaceModels } = await import("@/lib/faceApiClient");
        await loadFaceModels();
      } catch (e) {
        if (cancelled) return;
        setErrorMsg(
          `Face recognition failed to load on your device. Exact error: "${
            e instanceof Error ? e.message : String(e)
          }"`
        );
        setStatus("model-error");
        return;
      }
      if (cancelled || stoppedRef.current) return;
      setStatus("ready");

      const faceapi = await import("face-api.js");
      liveCheckRef.current = setInterval(async () => {
        if (stoppedRef.current || cancelled) return;
        const video = videoRef.current;
        if (!video || video.readyState < 2) return;
        try {
          const detection = await faceapi.detectSingleFace(
            video,
            new faceapi.TinyFaceDetectorOptions({ inputSize: 224 })
          );
          if (!stoppedRef.current && !cancelled) setFaceDetected(!!detection);
        } catch {
          // Ignore transient detection hiccups — the authoritative check runs at capture time.
        }
      }, 400);
    })();

    return () => {
      cancelled = true;
    };
  }, [status]);

  async function handleCapture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    setCaptureError(null);
    setStatus("processing");

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Mirror horizontally so the saved photo matches what the person saw of themself.
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
      const { computeFaceDescriptor } = await import("@/lib/faceApiClient");
      const descriptor = await computeFaceDescriptor(canvas);
      if (!descriptor) {
        setCaptureError("Couldn't find a clear face in that shot. Face the camera directly and try again.");
        setStatus("ready");
        return;
      }
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      stopCamera();
      setStatus("captured");
      onCaptured(dataUrl, descriptor);
    } catch (e) {
      setCaptureError(
        `Couldn't process that photo. Exact error: "${e instanceof Error ? e.message : String(e)}"`
      );
      setStatus("ready");
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3] max-w-sm mx-auto">
        <video
          ref={videoRef}
          muted
          playsInline
          className="w-full h-full object-cover -scale-x-100"
        />
        <canvas ref={canvasRef} className="hidden" />

        {(status === "starting-camera" || status === "loading-model") && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-sm">
            {status === "starting-camera" ? "Starting camera…" : "Loading face check…"}
          </div>
        )}

        {status === "processing" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-sm">
            Checking photo…
          </div>
        )}

        {status === "ready" && (
          <div
            className={`absolute bottom-2 left-2 right-2 text-center text-xs font-medium rounded-lg py-1.5 ${
              faceDetected
                ? "bg-success/80 text-white"
                : "bg-black/60 text-white/80"
            }`}
          >
            {faceDetected ? "Face detected" : "Center your face in the frame"}
          </div>
        )}
      </div>

      {status === "camera-error" && (
        <p className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2 max-w-sm mx-auto">
          {errorMsg}
        </p>
      )}
      {status === "model-error" && (
        <p className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2 max-w-sm mx-auto">
          {errorMsg}
        </p>
      )}
      {captureError && (
        <p className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2 max-w-sm mx-auto">
          {captureError}
        </p>
      )}

      {status === "ready" && (
        <div className="text-center space-y-3">
          <p className="text-sm text-foreground/60">
            {mode === "enroll"
              ? "This photo will be your reference photo for future clock-ins."
              : "Take a quick selfie to verify it's you."}
          </p>
          <button
            type="button"
            onClick={handleCapture}
            className="rounded-lg bg-brand text-white font-medium px-6 py-2.5 hover:bg-brand-dark transition-colors"
          >
            Take photo
          </button>
        </div>
      )}

      {onCancel && status !== "captured" && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onCancel();
            }}
            className="text-sm text-foreground/50 hover:text-foreground/80"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
