"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Compass, Luggage, User } from "lucide-react";

const TABS = [
  { href: "/", label: "发现", icon: Compass },
  { href: "/events", label: "公演", icon: CalendarDays },
  { href: "/trips", label: "远征", icon: Luggage },
  { href: "/me", label: "我的", icon: User },
];

export default function BottomTabs() {
  const pathname = usePathname();

  return (
    <nav className="site-bottom-tabs fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 backdrop-blur-md safe-bottom md:hidden dark:border-zinc-800 dark:bg-surface-dark/95">
      <div className="flex">
        {TABS.map((tab) => {
          const active =
            tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              prefetch={false}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs ${
                active
                  ? "text-brand-strong dark:text-violet-300"
                  : "text-zinc-500 dark:text-zinc-500"
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
