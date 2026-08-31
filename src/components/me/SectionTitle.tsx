export default function SectionTitle({
  icon,
  title,
  sub,
  right,
}: {
  icon: React.ReactNode;
  title: string;
  sub?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand-strong dark:bg-brand/20 dark:text-violet-300">
          {icon}
        </span>
        <div>
          <h2 className="text-lg leading-tight font-bold">{title}</h2>
          {sub && <p className="text-xs text-zinc-400 dark:text-zinc-500">{sub}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}
