import { Clock } from "lucide-react";

/** Map a status label to its Organic tag class. */
export function statusTagClass(label: string): string {
  const s = label.toLowerCase();
  if (["approved", "active", "earning"].includes(s)) return "tag tag-accent-2";
  if (s === "awaiting") return "tag tag-accent";
  if (s === "sent back") return "tag tag-outline";
  return "tag tag-neutral"; // assigned, paused, cash-out, submitted…
}

export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="page-header">
      <div>
        <h2>{title}</h2>
        <div className="page-sub muted">{subtitle}</div>
      </div>
      <span className="tag tag-accent-2" style={{ gap: 6 }}>
        <Clock size={13} strokeWidth={2.75} /> Bot online
      </span>
    </div>
  );
}
