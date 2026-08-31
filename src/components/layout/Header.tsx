"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import ThemeToggle from "./ThemeToggle";

const NAV = [
  { href: "/", label: "发现" },
  { href: "/events", label: "公演" },
  { href: "/trips", label: "远征" },
  { href: "/me", label: "我的" },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="site-header sticky top-0 z-40 border-b border-zinc-200/70 bg-white/80 backdrop-blur-md dark:border-zinc-800/70 dark:bg-surface-dark/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href="/" prefetch={false} className="flex items-baseline gap-1.5 shrink-0">
          <span className="text-lg font-bold tracking-tight text-gradient-brand">
            远征手账
          </span>
          <span className="hidden text-xs font-medium text-zinc-400 sm:block dark:text-zinc-500">
            遠征手帳
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : item.href === "/events"
                  ? pathname.startsWith("/events") || pathname.startsWith("/map")
                  : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className={`rounded-full px-3 py-1.5 text-sm transition ${
                  active
                    ? "bg-brand-soft font-semibold text-brand-strong dark:bg-brand/20 dark:text-violet-300"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="搜索"
            data-search-trigger
            className="flex h-11 items-center gap-2 rounded-full px-3 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <Search size={17} />
            <span className="hidden text-sm lg:block">搜索艺人 / 场地…</span>
            <kbd className="hidden rounded border border-zinc-300 px-1.5 text-xs text-zinc-400 lg:block dark:border-zinc-700">
              ⌘K
            </kbd>
          </button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
