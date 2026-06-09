interface StatCardProps {
  label: string;
  value: string | number;
  accent?: boolean;
}

export function StatCard({ label, value, accent = false }: StatCardProps) {
  return (
    <div className={`rounded-2xl p-3 ring-1 ${accent ? 'bg-cyan-500 text-neutral-950 ring-cyan-300/30' : 'bg-neutral-900 text-white ring-white/10'}`}>
      <div className={`text-[10px] font-black ${accent ? 'text-neutral-800' : 'text-neutral-500'}`}>{label}</div>
      <div className="mt-1 text-xl font-black leading-none tracking-tight">{value}</div>
    </div>
  );
}
