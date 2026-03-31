type ClientHeaderProps = {
  name: string;
  firm: string;
  objectiveCount: number;
  deployedCount: number;
};

export function ClientHeader({ name, firm, objectiveCount, deployedCount }: ClientHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h2 className="text-xl font-bold text-[#f1f5f9]">{name}</h2>
        <p className="text-[0.7rem] text-white/40">
          {firm} · {objectiveCount} objective{objectiveCount !== 1 ? "s" : ""}
          {deployedCount > 0 && ` · ${deployedCount} deployed`}
        </p>
      </div>
    </div>
  );
}
