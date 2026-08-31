export default function Footer() {
  return (
    <footer className="site-footer mt-16 border-t border-zinc-200 pb-24 pt-8 text-center text-xs leading-relaxed text-zinc-400 md:pb-8 dark:border-zinc-800 dark:text-zinc-600">
      <p className="font-medium">远征手账 遠征手帳 · 面向日音人的全日本 Live 情报站</p>
      <p className="mx-auto mt-2 max-w-xl px-4">
        演出信息来自白名单官方来源。购票、抽选资格和截止时间
        可能随时变更，付款前请以跳转后的官方页面为准。
      </p>
      <p className="mt-2">
        票价以 JPY 为准 · 参考汇率非实时 · 地图底图 出典：国土地理院タイル
      </p>
    </footer>
  );
}
