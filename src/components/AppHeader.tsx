"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type Tab = { href: string; label: string };

export default function AppHeader({
  name,
  subtitle,
  tabs,
}: {
  name: string;
  subtitle: string;
  tabs: Tab[];
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <header className="bg-brand text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <p className="font-[family-name:var(--font-display)] font-bold text-lg leading-tight">
            Manipur Chapter
          </p>
          <p className="text-xs text-white/70">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-white/85 hidden sm:inline">Hi, {name}</span>
          <Link
            href="/account"
            className="text-sm bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-3 py-1.5 transition-colors"
          >
            Account
          </Link>
          <button
            onClick={handleLogout}
            className="text-sm bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg px-3 py-1.5 transition-colors"
          >
            Log out
          </button>
        </div>
      </div>
      <nav className="max-w-6xl mx-auto px-4 sm:px-6 flex gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              aria-current={active ? "page" : undefined}
              href={tab.href}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors ${
                active
                  ? "bg-background text-brand"
                  : "text-white/75 hover:text-white hover:bg-white/10"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
