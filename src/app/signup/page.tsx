"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import FaceCapture from "@/components/FaceCapture";

type Step = "account" | "profile" | "photo" | "saving";

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("account");
  const [error, setError] = useState<string | null>(null);

  const [employeeCode, setEmployeeCode] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [phone, setPhone] = useState("");
  const [alternatePhone, setAlternatePhone] = useState("");
  const [address, setAddress] = useState("");
  const [hobbies, setHobbies] = useState("");

  function handleAccountNext(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!employeeCode.trim() || !name.trim()) {
      setError("Login ID and full name are required.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
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
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeCode,
          name,
          password,
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
      router.push("/pending-approval");
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
            Create your account
          </h1>
          <p className="text-sm text-foreground/55 mt-1">
            Set up your login and take a reference photo. An admin reviews and approves new
            accounts before you can start clocking in.
          </p>
        </div>

        <StepDots step={step} />

        <div className="bg-surface border border-border rounded-2xl p-6">
          {step === "account" && (
            <form onSubmit={handleAccountNext} className="space-y-4">
              <h2 className="font-medium text-foreground/80">1. Choose your login</h2>
              <Field label="Login ID">
                <input
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value)}
                  placeholder="e.g. PRIYA"
                  autoCapitalize="characters"
                  className="input"
                  required
                />
              </Field>
              <Field label="Full name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Priya Singh"
                  className="input"
                  required
                />
              </Field>
              <Field label="Password">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  className="input"
                  required
                />
              </Field>
              <Field label="Confirm password">
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
                  onClick={() => setStep("account")}
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
                This becomes your profile photo, and every time you clock in or out, we&apos;ll
                compare your selfie to it to confirm it&apos;s really you.
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
            <div className="text-center text-sm text-foreground/55 py-8">
              Creating your account…
            </div>
          )}
        </div>

        <p className="text-center text-sm text-foreground/50">
          Already have an account?{" "}
          <Link href="/" className="text-brand underline underline-offset-2 hover:text-brand-dark">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

function StepDots({ step }: { step: Step }) {
  const order: Step[] = ["account", "profile", "photo"];
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
