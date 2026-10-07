"use client";
import { AskPanel } from "@/components/AskPanel";
import { useFetch } from "@/lib/hooks";
import type { Me } from "@/lib/types";

/** Ask Sidenote across every meeting. */
export default function AskPage() {
  const { data: me } = useFetch<Me>("/api/me");
  return (
    <div style={{ display: "flex", justifyContent: "center", height: "100%" }}>
      <div style={{ display: "flex", width: "min(760px, 100%)", flexDirection: "column" }}>
        <AskPanel meetingId={null} greeting={me ? `Hi ${me.name.split(" ")[0]}, how can I help today?` : undefined} />
      </div>
    </div>
  );
}
