export default function Home() {
  return (
    <div className="flex min-h-screen">
      <aside className="w-[220px] border-r border-white/[0.08] bg-gradient-to-b from-[#1a1040] to-[#0f1729] p-4">
        <div className="text-center mb-6 pb-4 border-b border-white/[0.08]">
          <h1 className="text-xl font-extrabold bg-gradient-to-r from-[#ef4444] to-[#3b82f6] bg-clip-text text-transparent">
            slushie.machine
          </h1>
          <p className="text-[0.65rem] text-white/40 mt-0.5">v0.1</p>
        </div>
        <p className="text-xs text-white/30">No clients yet</p>
      </aside>
      <main className="flex-1 p-6">
        <p className="text-white/50">Select or create a client to get started.</p>
      </main>
    </div>
  );
}
