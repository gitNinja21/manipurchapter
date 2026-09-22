"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { REVIEW_QUESTIONS, type Ratings } from "@/lib/customerReviews";
import { api } from "@/components/team/useTeamData";

type Session = { employeeName: string; submitted: boolean };
export default function CustomerReviewForm({ googleReviewUrl }: { googleReviewUrl?: string }) {
  const saving = useRef(false);
  const [finished, setFinished] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [ratings, setRatings] = useState<Partial<Ratings>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api<Session>("/api/reviews/session", "GET", undefined, controller.signal)
      .then(s => { if (!controller.signal.aborted) setSession(s); })
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  async function enterCode(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try { setSession(await api<Session>("/api/reviews/code", "POST", {code})); setRatings({}); setFinished(false); }
    catch(e) { setError(e instanceof Error ? e.message : "Could not check the code."); }
    finally { setBusy(false); }
  }
  async function saveReview(values: Partial<Ratings>) {
    if (saving.current || !session || session.submitted || !REVIEW_QUESTIONS.every(q => values[q.key])) return;
    saving.current = true;
    setBusy(true); setError("");
    try {
      await api("/api/reviews/submit", "POST", values);
      setSession(s => s ? {...s, submitted: true} : s);
    } catch(e) {
      setError(e instanceof Error ? e.message : "Could not save your review. Please try again.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  function rate(key: keyof Ratings, stars: number) {
    if (saving.current || busy) return;
    const next = {...ratings, [key]: stars};
    setRatings(next);
    void saveReview(next);
  }
  const complete = REVIEW_QUESTIONS.every(q => ratings[q.key]);
  return <main className="flex-1 w-full max-w-lg mx-auto px-4 py-8 sm:py-12 space-y-6">
    <header className="text-center space-y-2">
      <p className="text-brand text-sm font-semibold tracking-widest uppercase">Manipur Chapter</p>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">Rate your service</h1>
      <p className="text-foreground/60 text-sm">Five quick ratings. No account or written feedback needed.</p>
    </header>
    {loading ? <p role="status" className="text-center">Loading…</p> : session?.submitted ?
      <section className="admin-panel p-8 text-center space-y-3">
        <p className="text-4xl text-brand" aria-hidden="true">✓</p>
        <h2 className="text-xl font-semibold">Thank you!</h2>
        <p>Your review for {session.employeeName} has been saved.</p>
        {googleReviewUrl && !finished ? <div className="pt-4 space-y-3">
          <h3 className="font-semibold">Review Manipur Chapter on Google</h3>
          <p className="text-sm text-foreground/60">Would you also like to share your restaurant experience? This is optional. Your employee review is already saved.</p>
          <a className="admin-button block w-full" href={googleReviewUrl} target="_blank" rel="noopener noreferrer">Review us on Google</a>
          <p className="text-xs text-foreground/60">Opens Google in a new tab. You may need to sign in to your Google account. No need to return here.</p>
          <button className="text-brand underline text-sm" onClick={() => setFinished(true)}>Done</button>
        </div> : <p className="text-sm text-foreground/60">You’re all done. You can close this page now.</p>}
        <button className="text-brand underline text-sm" onClick={() => {setSession(null);setCode("");setRatings({});setError("");}}>Enter another code</button>
      </section> : !session ?
      <form onSubmit={enterCode} className="admin-panel p-6 space-y-5">
        <label className="block text-sm font-medium">Your server’s four-digit code
          <input autoComplete="off" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} required value={code} onChange={e => setCode(e.target.value.replace(/\D/g,"").slice(0,4))} className="input mt-3 text-center !text-3xl tracking-[0.4em] tabular-nums" placeholder="••••" />
        </label>
        <p className="text-sm text-foreground/60">Ask your waiter or waitress for a code. It is valid for five minutes and can be used once.</p>
        <button className="admin-button w-full" disabled={busy || code.length !== 4}>{busy ? "Checking…" : "Start review"}</button>
      </form> :
      <section className="space-y-4" aria-busy={busy}>
        <section className="admin-panel p-4 text-center">
          <p className="text-sm text-foreground/60">You’re reviewing</p><h2 className="font-semibold text-xl">{session.employeeName}</h2>
          <p className="text-xs text-foreground/60 mt-2">1 = Poor · 5 = Excellent</p>
          <p className="text-sm text-foreground/60 mt-2">Your review saves automatically as soon as all five questions are rated.</p>
        </section>
        {REVIEW_QUESTIONS.map((q,i) => <fieldset key={q.key} className="admin-panel p-4">
          <legend className="sr-only">{q.label}</legend>
          <p className="text-sm font-medium" aria-hidden="true">{i+1}. {q.label}</p>
          <div className="flex justify-between gap-1 mt-2">
            {[1,2,3,4,5].map(star => <label key={star} className="relative cursor-pointer p-1">
              <input className="peer sr-only" type="radio" name={q.key} value={star} checked={ratings[q.key] === star} onChange={() => rate(q.key, star)} required disabled={busy} aria-label={`${star} ${star === 1 ? "star" : "stars"}`} />
              <span aria-hidden="true" className={`block text-4xl rounded peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-brand ${star <= (ratings[q.key] ?? 0) ? "text-amber-500" : "text-foreground/25"}`}>★</span>
            </label>)}
          </div>
        </fieldset>)}
        <p role="status" className="text-center text-sm text-foreground/60">{busy ? "Saving your review…" : `${REVIEW_QUESTIONS.filter(q => ratings[q.key]).length} of 5 rated`}</p>
        {error && complete && !busy && <button type="button" className="admin-button w-full" onClick={() => void saveReview(ratings)}>Retry saving</button>}
        <button type="button" className="block mx-auto text-sm text-brand underline" disabled={busy} onClick={() => {setSession(null);setCode("");setError("");}}>Wrong server? Enter a different code</button>
      </section>}
    {error && <p role="alert" className="text-danger text-sm admin-panel p-4">{error}</p>}
    <footer className="text-center text-xs text-foreground/50"><Link href="/">Staff sign in</Link></footer>
  </main>;
}
