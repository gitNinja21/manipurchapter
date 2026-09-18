import { Suspense } from "react";
import Announcements from "@/components/team/Announcements";
export default function Page() {
  return (
    <Suspense fallback={<p>Loading announcements…</p>}>
      <Announcements admin={true} />
    </Suspense>
  );
}
