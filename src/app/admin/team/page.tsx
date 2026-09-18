import { Suspense } from "react";
import TeamWorkspace from "@/components/team/TeamWorkspace";
export default function Page() {
  return (
    <Suspense fallback={<p>Loading team space…</p>}>
      <TeamWorkspace admin={true} />
    </Suspense>
  );
}
