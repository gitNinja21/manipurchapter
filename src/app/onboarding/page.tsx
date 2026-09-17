"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FaceCapture from "@/components/FaceCapture";

type Step = "password" | "profile" | "photo" | "saving";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("password");
  const [error, setError] = useState<string | null>(null);

  const [newEmployeeCode, setNewEmployeeCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [phone, setPhone] = useState("");
  const [alternatePhone, setAlternatePhone] = useState("");
  const [address, setAddress] = useState("");
  const [hobbies, setHobbies] = useState("");

  function handlePasswordNext(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setError("New passwords don't match.");
      return;
    }
    setStep("profile");
  }

  function handleProfileNext(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!phone.trim() || !address.trim()) {
      setError("Phone number and address are required.");
      return;
    }
    setStep("photo");
  }

  async function handlePhotoCaptured(photoDataUrl: string, descriptor: number[]) {
    setStep("saving");
    setError(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newEmployeeCode: newEmployeeCode || undefined,
          newPassword,
          phone,
          alternatePhone,
          address,
          hobbies,
          photoDataUrl,
          descriptor,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setStep("photo");
        return;
      }
      router.push("/employee");
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
      setStep("photo");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">
            Welcome! Let&apos;s set up your account
          </h1>
          <p className="text-sm text-foreground/55 mt-1">
            Before you can clock in, set your own password and fill in a few details.
          </p>
        </div>

        <StepDots step={step} />

        <div className="bg-surface border border-border rounded-2xl p-6">
          {step === "password" && (
            <form onSubmit={handlePasswordNext} className="space-y-4">
              <h2 className="font-medium text-foreground/80">1. Choose your login</h2>
              <Field label="Login ID (optional — leave blank to keep the one your manager gave you)">
                <input
                  value={newEmployeeCode}
                  onChange={(e) => setNewEmployeeCode(e.target.value)}
                  placeholder="e.g. PRIYA"
                  className="input"
                />
              </Field>
              <Field label="New password">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={6}
                  className="input"
                  required
                />
              </Field>
              <Field label="Confirm new password">
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={6}
                  className="input"
                  required
                />
              </Field>
              {error && <ErrorBox message={error} />}
              <button type="submit" className="btn-primary w-full">
                Continue
              </button>
            </form>
          )}

          {step === "profile" && (
            <form onSubmit={handleProfileNext} className="space-y-4">
              <h2 className="font-medium text-foreground/80">2. Your details</h2>
              <Field label="Phone number">
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="input"
                  required
                />
              </Field>
              <Field label="Alternate phone number (optional)">
                <input
                  value={alternatePhone}
                  onChange={(e) => setAlternatePhone(e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Address">
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="input min-h-[4.5rem]"
                  required
                />
              </Field>
              <Field label="Hobbies (optional)">
                <input
                  value={hobbies}
                  onChange={(e) => setHobbies(e.target.value)}
                  className="input"
                />
              </Field>
              {error && <ErrorBox message={error} />}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep("password")}
                  className="text-sm text-foreground/50 hover:text-foreground/80 px-2"
                >
                  Back
                </button>
                <button type="submit" className="btn-primary flex-1">
                  Continue
                </button>
              </div>
            </form>
          )}

          {step === "photo" && (
            <div className="space-y-4">
              <h2 className="font-medium text-foreground/80">3. Take your reference photo</h2>
              <p className="text-sm text-foreground/55">
                From now on, every time you clock in or out, we&apos;ll compare your selfie
                to this photo to confirm it&apos;s really you.
              </p>
              {error && <ErrorBox message={error} />}
              <FaceCapture mode="enroll" onCaptured={handlePhotoCaptured} />
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setStep("profile")}
                  className="text-sm text-foreground/50 hover:text-foreground/80"
                >
                  Back
                </button>
              </div>
            </div>
          )}

          {step === "saving" && (
            <div className="text-center text-sm text-foreground/55 py-8">Saving your account…</div>
          )}
        </div>
      </div>
    </div>
  );
}

function StepDots({ step }: { step: Step }) {
  const order: Step[] = ["password", "profile", "photo"];
  const idx = step === "saving" ? 2 : order.indexOf(step);
  return (
    <div className="flex items-center justify-center gap-2">
      {order.map((_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i <= idx ? "w-8 bg-brand" : "w-4 bg-border"
          }`}
        />
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="text-sm block">
      <span className="block text-foreground/55 mb-1">{label}</span>
      {children}
    </label>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <p className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">
      {message}
    </p>
  );
}
