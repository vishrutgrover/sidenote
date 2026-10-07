import { Clock } from "lucide-react";

export function ComingSoon({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty" style={{ paddingTop: 120 }}>
      <Clock size={32} color="var(--primary)" />
      <strong>{title} is coming soon</strong>
      <p>{children ?? "This part of the product is not built yet."}</p>
    </div>
  );
}
