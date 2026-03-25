export default function OpportunityDetailLoading() {
  return (
    <div className="min-h-screen bg-[#f4f7f9] animate-pulse">
      <div className="h-16 bg-white/80 border-b border-slate-100" />
      <div className="max-w-[1400px] mx-auto p-4 sm:p-8 space-y-6">
        <div className="h-56 rounded-[32px] bg-white border border-slate-100 shadow-sm" />
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
          <div className="xl:col-span-8 h-[480px] rounded-[32px] bg-white border border-slate-100" />
          <div className="xl:col-span-4 space-y-6">
            <div className="h-48 rounded-[32px] bg-white border border-slate-100" />
            <div className="h-64 rounded-[32px] bg-white border border-slate-100" />
          </div>
        </div>
      </div>
    </div>
  );
}
