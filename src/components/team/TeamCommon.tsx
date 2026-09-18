"use client";
export function ErrorNotice({ error }: { error?: string }) {
  return error ? (
    <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">
      {error}
    </p>
  ) : null;
}
export function Pager({
  page,
  total,
  size = 30,
  onPage,
}: {
  page: number;
  total: number;
  size?: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-foreground/60">
        {total} results · Page {page} of {Math.max(1, Math.ceil(total / size))}
      </span>
      <div className="flex gap-2">
        <button
          className="admin-button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </button>
        <button
          className="admin-button"
          disabled={page * size >= total}
          onClick={() => onPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
