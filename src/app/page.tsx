import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import Link from "next/link";
import LoginForm from "@/components/LoginForm";

export default async function LandingPage() {
  const session = await getSession();
  if (session) {
    redirect(session.role === "ADMIN" ? "/admin" : "/employee");
  }

  return (
    <main className="flex-1 flex flex-col">
      <div className="flex-1 grid lg:grid-cols-2">
        {/* Brand / hero side */}
        <div className="relative bg-brand text-white flex flex-col justify-between px-8 py-12 lg:px-16 lg:py-16 overflow-hidden">
          <div
            className="absolute inset-0 opacity-15"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 20%, white 0, transparent 45%), radial-gradient(circle at 85% 75%, white 0, transparent 40%)",
            }}
          />
          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 text-accent-light/90 text-sm font-medium tracking-wide uppercase">
              <span className="inline-block w-8 h-px bg-accent-light/70" />
              Manipur Chapter
            </div>
            <h1 className="mt-6 font-[family-name:var(--font-display)] text-4xl sm:text-5xl leading-tight font-bold">
              Manipur Chapter
              <br />
              Attendance System
            </h1>
            <p className="mt-5 text-white/85 max-w-md leading-relaxed">
              Clock in, clock out, and stay in the loop — all in one place for
              the whole team.
            </p>
          </div>

          <div className="relative z-10 grid grid-cols-3 gap-4 max-w-md">
            <Feature label="Verified selfie clock-in/out" />
            <Feature label="Live shift &amp; hours tracking" />
            <Feature label="Team announcements" />
          </div>
        </div>

        {/* Login side */}
        <div className="flex items-center justify-center px-6 py-12 sm:px-12">
          <div className="w-full max-w-sm">
            <div className="mb-8">
              <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">
                Staff sign in
              </h2>
              <p className="mt-1.5 text-sm text-foreground/60">
                Sign in with your login ID and password.
              </p>
            </div>
            <div className="bg-surface rounded-2xl border border-border shadow-sm p-6 sm:p-7">
              <LoginForm />
              <Link className="block text-center text-brand underline text-sm mt-6" href="/review">Customer? Rate your service</Link>
            </div>
          </div>
        </div>
      </div>

      <footer className="border-t border-border bg-surface-muted px-6 py-4 text-center text-xs text-foreground/50">
        Manipur Chapter Attendance System · Internal staff tool
      </footer>
    </main>
  );
}

function Feature({ label }: { label: string }) {
  return (
    <div className="rounded-lg bg-white/10 border border-white/15 px-3 py-3 text-xs leading-snug text-white/90">
      {label}
    </div>
  );
}
