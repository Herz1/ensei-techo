"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, MapPin, MicVocal, Search, X } from "lucide-react";
import { searchAll } from "@/lib/search";
import type { SearchIndex } from "@/lib/types";
import { formatJaDateShort } from "@/lib/time";
import ArtistAvatar from "@/components/ui/ArtistAvatar";
import StatusBadge from "@/components/event/StatusBadge";
import { TIER_LABEL } from "@/components/event/status";

let searchIndexPromise: Promise<SearchIndex> | null = null;

function loadSearchIndex(): Promise<SearchIndex> {
  if (!searchIndexPromise) {
    searchIndexPromise = fetch("/data/search-index.json")
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const value = await response.json() as SearchIndex;
        if (value.schemaVersion !== 1 || !Array.isArray(value.events)) {
          throw new Error("搜索索引格式无效");
        }
        return value;
      })
      .catch((error) => {
        searchIndexPromise = null;
        throw error;
      });
  }
  return searchIndexPromise;
}

export default function SearchModal() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searchIndex, setSearchIndex] = useState<SearchIndex | null>(null);
  const [indexError, setIndexError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const router = useRouter();

  const results = useMemo(
    () => searchIndex ? searchAll(q, searchIndex) : { artists: [], venues: [], events: [] },
    [q, searchIndex],
  );
  const hasAny =
    results.artists.length + results.venues.length + results.events.length > 0;
  const options = useMemo(() => [
    ...results.artists.map((item) => ({ key: `artist-${item.id}`, href: `/artists/${item.id}` })),
    ...results.events.map((item) => ({ key: `event-${item.id}`, href: `/events/${item.id}` })),
    ...results.venues.map((item) => ({ key: `venue-${item.id}`, href: `/venues/${item.id}` })),
  ], [results]);
  const selectedIndex = options.length
    ? Math.min(Math.max(activeIndex, 0), options.length - 1)
    : -1;

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setActiveIndex(-1);
  }, []);

  // 全局快捷键 + 触发按钮
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) close();
        else {
          previousFocusRef.current = document.activeElement as HTMLElement | null;
          setOpen(true);
        }
      }
      if (open && e.key === "Escape") close();
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      const trigger = t.closest<HTMLElement>("[data-search-trigger]");
      if (trigger) {
        e.preventDefault();
        previousFocusRef.current = trigger;
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [close, open]);

  useEffect(() => {
    if (open) {
      loadSearchIndex().then((index) => {
        setSearchIndex(index);
        setIndexError("");
      }).catch((error) => {
        setIndexError(error instanceof Error ? error.message : "搜索索引加载失败");
      });
      setTimeout(() => inputRef.current?.focus(), 30);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      previousFocusRef.current?.focus();
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ) ?? [])].filter((element) => !element.hasAttribute("hidden"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onTab);
    return () => document.removeEventListener("keydown", onTab);
  }, [open]);

  useEffect(() => {
    if (selectedIndex < 0) return;
    dialogRef.current
      ?.querySelector<HTMLElement>(`[data-search-index="${selectedIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  const selectedHref = selectedIndex >= 0
    ? options[selectedIndex]?.href ?? null
    : q
      ? `/events?q=${encodeURIComponent(q)}`
      : null;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 p-4 pt-[12vh] backdrop-blur-sm"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="search-dialog-title"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <h2 id="search-dialog-title" className="sr-only">全站搜索</h2>
        {/* 输入 */}
        <div className="flex items-center gap-3 border-b border-zinc-100 px-4 dark:border-zinc-800">
          <Search size={18} className="shrink-0 text-zinc-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setActiveIndex(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && options.length) {
                e.preventDefault();
                setActiveIndex((index) => (index + 1 + options.length) % options.length);
              } else if (e.key === "ArrowUp" && options.length) {
                e.preventDefault();
                setActiveIndex((index) => index <= 0 ? options.length - 1 : index - 1);
              } else if (e.key === "Enter" && selectedHref) {
                e.preventDefault();
                go(selectedHref);
              }
            }}
            aria-label="搜索艺人、场地或演出"
            aria-controls="search-results"
            aria-activedescendant={selectedIndex >= 0 ? `search-option-${selectedIndex}` : undefined}
            placeholder="艺人 / 场地 / 巡演名(中日文、罗马字、假名都行)"
            className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-zinc-400"
          />
          <button
            type="button"
            onClick={close}
            className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="关闭搜索"
          >
            <X size={16} />
          </button>
        </div>

        {/* 结果 */}
        <div id="search-results" role="listbox" aria-label="搜索结果" className="max-h-[55vh] overflow-y-auto p-2">
          {!q && (
            <p className="px-3 py-8 text-center text-xs text-zinc-400">
              试试「King Gnu」「キングヌー」「八爷」「横浜」「武道館」
            </p>
          )}
          {q && !searchIndex && !indexError && (
            <p className="px-3 py-8 text-center text-xs text-zinc-400">搜索索引加载中…</p>
          )}
          {q && indexError && (
            <p role="alert" className="px-3 py-8 text-center text-xs text-red-500">
              搜索索引加载失败：{indexError}
            </p>
          )}
          {q && searchIndex && !hasAny && (
            <p className="px-3 py-8 text-center text-xs text-zinc-400">
              没有找到「{q}」相关结果
            </p>
          )}

          {results.artists.length > 0 && (
            <section>
              <p className="flex items-center gap-1 px-3 pt-2 pb-1 text-xs font-bold tracking-wider text-zinc-400">
                <MicVocal size={11} /> 艺人
              </p>
              {results.artists.map((a, index) => {
                return (
                <button
                  key={a.id}
                  id={`search-option-${index}`}
                  role="option"
                  aria-selected={selectedIndex === index}
                  data-search-index={index}
                  tabIndex={-1}
                  onClick={() => go(`/artists/${a.id}`)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${selectedIndex === index ? "bg-violet-50 text-violet-900 dark:bg-violet-500/15 dark:text-violet-100" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
                >
                  <ArtistAvatar artist={a} size={32} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {a.nameJa}
                    </span>
                    <span className="block truncate text-xs text-zinc-400">
                      {a.nameZh !== a.nameJa && `${a.nameZh} · `}
                      {a.romaji}
                      {a.aliases.length > 0 && ` · ${a.aliases.join("/")}`}
                    </span>
                  </span>
                </button>
              );})}
            </section>
          )}

          {results.events.length > 0 && (
            <section>
              <p className="flex items-center gap-1 px-3 pt-3 pb-1 text-xs font-bold tracking-wider text-zinc-400">
                <CalendarDays size={11} /> 演出
              </p>
              {results.events.map((e, eventIndex) => {
                const index = results.artists.length + eventIndex;
                return (
                <button
                  key={e.id}
                  id={`search-option-${index}`}
                  role="option"
                  aria-selected={selectedIndex === index}
                  data-search-index={index}
                  tabIndex={-1}
                  data-event-id={e.id}
                  onClick={() => go(`/events/${e.id}`)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${selectedIndex === index ? "bg-violet-50 text-violet-900 dark:bg-violet-500/15 dark:text-violet-100" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
                >
                  <span className="w-14 shrink-0 text-sm font-bold tabular-nums">
                    {formatJaDateShort(e.date)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {e.titleJa}
                  </span>
                  <StatusBadge event={e} className="shrink-0 scale-90" />
                </button>
              );})}
            </section>
          )}

          {results.venues.length > 0 && (
            <section>
              <p className="flex items-center gap-1 px-3 pt-3 pb-1 text-xs font-bold tracking-wider text-zinc-400">
                <MapPin size={11} /> 场地
              </p>
              {results.venues.map((v, venueIndex) => {
                const index = results.artists.length + results.events.length + venueIndex;
                return (
                <button
                  key={v.id}
                  id={`search-option-${index}`}
                  role="option"
                  aria-selected={selectedIndex === index}
                  data-search-index={index}
                  tabIndex={-1}
                  onClick={() => go(`/venues/${v.id}`)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${selectedIndex === index ? "bg-violet-50 text-violet-900 dark:bg-violet-500/15 dark:text-violet-100" : "hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
                >
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    {v.tier ? TIER_LABEL[v.tier] : "资料待补全"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {v.nameJa}
                    </span>
                    <span className="block truncate text-xs text-zinc-400">
                      {[v.nameZh, v.city].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
              );})}
            </section>
          )}

          {q && (
            <button
              onClick={() => go(`/events?q=${encodeURIComponent(q)}`)}
              className="mt-2 flex w-full items-center gap-2 rounded-xl border border-dashed border-zinc-300 px-3 py-2.5 text-xs font-semibold text-zinc-500 hover:border-violet-400 hover:text-brand-strong dark:border-zinc-700 dark:hover:border-violet-500 dark:hover:text-violet-300"
            >
              <Search size={13} />
              在演出列表中筛选「{q}」
            </button>
          )}
        </div>

        <p className="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-400 dark:border-zinc-800">
          ↑↓ 选择 · Enter 打开 · Esc 关闭 · ⌘K / Ctrl+K 呼出
        </p>
      </div>
    </div>
  );
}
