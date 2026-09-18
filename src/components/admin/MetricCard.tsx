import Link from "next/link";
export default function MetricCard({
  label,
  value,
  detail,
  href,
}: {
  label: string;
  value: string | number;
  detail: string;
  href?: string;
}) {
  const content = (
    <>
      <p className="text-sm text-foreground/65">{label}</p>
      <p className="mt-3 text-xl sm:text-3xl [overflow-wrap:anywhere] font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      <p className="mt-2 text-xs text-foreground/60">{detail}</p>
    </>
  );
  return href ? (
    <Link
      href={href}
      className="admin-panel block p-5 hover:border-brand/50 transition-colors"
    >
      {content}
    </Link>
  ) : (
    <div className="admin-panel p-5">{content}</div>
  );
}
