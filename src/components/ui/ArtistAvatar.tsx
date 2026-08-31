import type { Artist } from "@/lib/types";

export default function ArtistAvatar({
  artist,
  size = 40,
  className = "",
}: {
  artist: Artist;
  size?: number;
  className?: string;
}) {
  const initial = artist.nameJa.trim().charAt(0).toUpperCase();
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white select-none ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `linear-gradient(135deg, ${artist.color}, ${artist.color}99 60%, #00000055)`,
      }}
      aria-hidden
    >
      {initial}
    </div>
  );
}
