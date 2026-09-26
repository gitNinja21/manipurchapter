"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { REVIEW_QUESTIONS, type Ratings } from "@/lib/customerReviews";
import { api } from "@/components/team/useTeamData";

type Session = { employeeName: string; submitted: boolean; ratings?: Ratings | null };
export default function CustomerReviewForm({ googleReviewUrl }: { googleReviewUrl?: string }) {
  const saving = useRef(false);
  const [session, setSession] = useState<Session | null>(null);
  const visit = useRef(0);
  const [inviteId,setInviteId] = useState<string|undefined>();
  const [code, setCode] = useState("");
  const [ratings, setRatings] = useState<Partial<Ratings>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const params=new URLSearchParams(window.location.hash.slice(1));
    const scannedCode=params.get("code"), scannedInvite=params.get("invite");
    if(scannedCode && /^[0-9]{4}$/.test(scannedCode) && scannedInvite) {
      setCode(scannedCode); setInviteId(scannedInvite);
      window.history.replaceState(window.history.state,"",window.location.pathname+window.location.search);
    }
    // Never resume another server from the persistent review cookie.
    // pagehide also clears state retained by the browser's Back/Forward cache.
    function invalidateVisit() { visit.current++; }
    function resetVisit() {
      invalidateVisit();
      saving.current = false;
      setSession(null); setInviteId(undefined); setCode(""); setRatings({}); setBusy(false); setError("");
    }
    function restorePage(event: PageTransitionEvent) {
      if (event.persisted) resetVisit();
    }
    window.addEventListener("pagehide", resetVisit);
    window.addEventListener("pageshow", restorePage);
    return () => {
      invalidateVisit();
      window.removeEventListener("pagehide", resetVisit);
      window.removeEventListener("pageshow", restorePage);
    };
  }, []);
  async function enterCode(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    const currentVisit = visit.current;
    try {
      const nextSession = await api<Session>("/api/reviews/code", "POST", {code,inviteId});
      if (currentVisit !== visit.current) return;
      setSession(nextSession); setRatings({});
    }
    catch(e) { if (currentVisit === visit.current) setError(e instanceof Error ? e.message : "Could not check the code."); }
    finally { if (currentVisit === visit.current) setBusy(false); }
  }
  async function saveReview(values: Partial<Ratings>) {
    if (saving.current || !session || session.submitted || !REVIEW_QUESTIONS.every(q => values[q.key])) return;
    const currentVisit = visit.current;
    saving.current = true;
    setBusy(true); setError("");
    try {
      await api("/api/reviews/submit", "POST", values);
      if (currentVisit !== visit.current) return;
      setSession(s => s ? {...s, submitted: true} : s);
    } catch(e) {
      if (currentVisit === visit.current) setError(e instanceof Error ? e.message : "Could not save your review. Please try again.");
    } finally {
      if (currentVisit === visit.current) {
        saving.current = false;
        setBusy(false);
      }
    }
  }
  function rate(key: keyof Ratings, stars: number) {
    if (saving.current || busy || session?.submitted) return;
    const next = {...ratings, [key]: stars};
    setRatings(next);
    void saveReview(next);
  }
  const complete = REVIEW_QUESTIONS.every(q => ratings[q.key]);
  return <div className="review-backdrop"><main className="flex-1 w-full max-w-lg mx-auto px-4 py-8 sm:py-12 space-y-6">
    <header className="review-heading text-center space-y-2">
      <p className="text-brand text-sm font-semibold tracking-widest uppercase">Manipur Chapter</p>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">Rate your service</h1>
      <p className="text-foreground/60 text-sm">Five quick ratings. No account or written feedback needed.</p>
    </header>
    {!session ?
      <form onSubmit={enterCode} className="admin-panel p-6 space-y-5">
        <label className="block text-sm font-medium">Your server’s four-digit code
          <input autoComplete="off" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} required value={code} onChange={e => {setInviteId(undefined);setCode(e.target.value.replace(/\D/g,"").slice(0,4));}} className="input mt-3 text-center !text-3xl tracking-[0.4em] tabular-nums" placeholder="••••" />
        </label>
        <p className="text-sm text-foreground/60">{inviteId ? "Your QR code is ready. Tap Start review to rate your server." : "Ask your waiter or waitress for a code. It is valid for five minutes and can be used once."}</p>
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
              <input className="peer sr-only" type="radio" name={q.key} value={star} checked={ratings[q.key] === star} onChange={() => rate(q.key, star)} required disabled={busy || session.submitted} aria-label={`${star} ${star === 1 ? "star" : "stars"}`} />
              <span aria-hidden="true" className={`block text-4xl rounded peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-brand ${star <= (ratings[q.key] ?? 0) ? "text-amber-500" : "text-foreground/25"}`}>★</span>
            </label>)}
          </div>
        </fieldset>)}
        {!session.submitted && <p role="status" className="text-center text-sm text-white/85">{busy ? "Saving your review…" : `${REVIEW_QUESTIONS.filter(q => ratings[q.key]).length} of 5 rated`}</p>}
        {googleReviewUrl && <p className="text-center text-sm text-white">Your words help our little place grow 🌱</p>}
        {googleReviewUrl && session.submitted && <p className="text-center text-sm text-white/90">Your server was <strong>{session.employeeName}</strong>. You’re welcome to mention their name in your Google review.</p>}
        {googleReviewUrl && (session.submitted ?
          <a className="admin-button block w-full text-center" href={googleReviewUrl} target="_blank" rel="noopener noreferrer">Review us on Google</a> :
          <button type="button" className="admin-button w-full" disabled>Review us on Google</button>)}
        {error && complete && !busy && <button type="button" className="admin-button w-full" onClick={() => void saveReview(ratings)}>Retry saving</button>}
        {!session.submitted && <button type="button" className="block mx-auto text-sm text-white underline" disabled={busy} onClick={() => {visit.current++;setSession(null);setInviteId(undefined);setCode("");setRatings({});setError("");}}>Wrong server? Enter a different code</button>}
      </section>}
    {error && <p role="alert" className="text-danger text-sm admin-panel p-4">{error}</p>}
    {!session && <footer className="text-center text-xs text-white/80"><Link href="/">Staff sign in</Link></footer>}
  </main></div>;
}
