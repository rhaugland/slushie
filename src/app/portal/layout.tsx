export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#080d19] text-white">
      {children}
    </div>
  );
}
