import CustomerReviewForm from "@/components/reviews/CustomerReviewForm";
export const metadata = { title: "Rate your service · Manipur Chapter" };
export const dynamic = "force-dynamic";
export default function Page() {
  const configuredUrl = process.env.GOOGLE_REVIEW_URL?.trim() ?? "https://g.page/r/CX-VFZVmOSebEAE/review";
  let googleReviewUrl: string | undefined;
  if (configuredUrl) {
    try {
      const url = new URL(configuredUrl);
      if (url.protocol === "https:") googleReviewUrl = url.href;
    } catch { /* Keep employee reviews available if the optional link is invalid. */ }
  }
  return <CustomerReviewForm googleReviewUrl={googleReviewUrl} />;
}
