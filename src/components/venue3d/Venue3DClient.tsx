"use client";

import dynamic from "next/dynamic";

const Venue3DViewer = dynamic(() => import("./Venue3DViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center rounded-3xl bg-[#0d0d16] text-sm text-zinc-400">
      3D 场景加载中…
    </div>
  ),
});

export default function Venue3DClient(props: {
  modelKey: string;
  venueName: string;
}) {
  return <Venue3DViewer {...props} />;
}
