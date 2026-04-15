"use client";

import { useState, useEffect } from "react";

type Props = {
  projectId?: string | null;
  projectName?: string;
  prefill?: { monthlyAmount: number; totalMonths: number } | null;
};

export function PaneBilling({ projectId, projectName, prefill }: Props) {
  const [billing, setBilling] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");

  // Setup form state
  const [clientEmail, setClientEmail] = useState("");
  const [monthlyAmount, setMonthlyAmount] = useState(prefill?.monthlyAmount ?? 5000);
  const [totalMonths, setTotalMonths] = useState(prefill?.totalMonths ?? 6);

  async function loadBilling() {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/billing?projectId=${projectId}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setBilling(data.billing);
      setInvoices(data.invoices || []);
      if (data.billing?.clientEmail) setClientEmail(data.billing.clientEmail);
      if (data.billing?.monthlyAmount) setMonthlyAmount(data.billing.monthlyAmount / 100);
      if (data.billing?.totalMonths) setTotalMonths(data.billing.totalMonths);
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBilling();
  }, [projectId]);

  async function handleStartBilling() {
    if (!projectId || !clientEmail.trim() || monthlyAmount <= 0) return;
    setActionLoading(true);
    setError("");
    try {
      const res = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          clientEmail,
          monthlyAmount: monthlyAmount * 100, // convert to cents
          totalMonths,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Failed to start billing");
        return;
      }
      await loadBilling();
    } catch (err: any) {
      setError(err.message || "Failed to start billing");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAction(action: "pause" | "resume" | "cancel") {
    if (!projectId) return;
    setActionLoading(true);
    setError("");
    try {
      const res = await fetch("/api/billing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, action }),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || `Failed to ${action} billing`);
        return;
      }
      await loadBilling();
    } catch (err: any) {
      setError(err.message || `Failed to ${action}`);
    } finally {
      setActionLoading(false);
    }
  }

  if (!projectId) return <p className="text-sm text-white/30">Select a project first.</p>;
  if (loading) return <p className="text-sm text-white/30">Loading...</p>;

  const isActive = billing?.status === "active";
  const isPaused = billing?.status === "paused";
  const isCancelled = billing?.status === "cancelled";
  const isComplete = billing?.status === "complete";
  const hasBilling = billing && !isCancelled;

  return (
    <div className="max-w-2xl space-y-6">
      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Status card */}
      {hasBilling && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 bg-white/[0.03] border-b border-white/[0.06]">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-white/80">Subscription</h2>
              {isActive && (
                <span className="flex items-center gap-1.5 text-xs text-green-400">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  Active
                </span>
              )}
              {isPaused && (
                <span className="flex items-center gap-1.5 text-xs text-yellow-400">
                  <span className="w-2 h-2 rounded-full bg-yellow-400" />
                  Paused
                </span>
              )}
              {isComplete && (
                <span className="text-xs text-blue-400">Complete</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isActive && (
                <button
                  onClick={() => handleAction("pause")}
                  disabled={actionLoading}
                  className="px-3 py-1.5 text-xs rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition disabled:opacity-50"
                >
                  Pause
                </button>
              )}
              {isPaused && (
                <button
                  onClick={() => handleAction("resume")}
                  disabled={actionLoading}
                  className="px-3 py-1.5 text-xs rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition disabled:opacity-50"
                >
                  Resume
                </button>
              )}
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-4 gap-6 mb-6">
              <div>
                <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-1">Monthly</div>
                <div className="text-xl font-bold text-white/90">${(billing.monthlyAmount / 100).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-1">Progress</div>
                <div className="text-xl font-bold text-white/90">{billing.monthsPaid}<span className="text-sm text-white/30">/{billing.totalMonths}</span></div>
              </div>
              <div>
                <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-1">Collected</div>
                <div className="text-xl font-bold text-white/90">${((billing.monthlyAmount / 100) * billing.monthsPaid).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-1">Client</div>
                <div className="text-sm text-white/60 truncate">{billing.clientEmail}</div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mb-6">
              <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isActive ? "bg-green-500" : isPaused ? "bg-yellow-500" : "bg-blue-500"}`}
                  style={{ width: `${(billing.monthsPaid / billing.totalMonths) * 100}%` }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[0.55rem] text-white/20">{billing.monthsPaid} paid</span>
                <span className="text-[0.55rem] text-white/20">{billing.totalMonths - billing.monthsPaid} remaining</span>
              </div>
            </div>

            {/* Cancel */}
            {(isActive || isPaused) && (
              <button
                onClick={() => { if (confirm("Cancel billing? This will stop all future invoices.")) handleAction("cancel"); }}
                disabled={actionLoading}
                className="text-xs text-red-400/40 hover:text-red-400 transition disabled:opacity-50"
              >
                Cancel subscription
              </button>
            )}
          </div>
        </div>
      )}

      {/* Invoice history */}
      {invoices.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
          <div className="px-6 py-4 bg-white/[0.03] border-b border-white/[0.06]">
            <h2 className="text-sm font-semibold text-white/80">Invoice History</h2>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {invoices.map((inv: any) => (
              <div key={inv.id} className="flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-white/40 font-mono w-24">{inv.number || inv.id.slice(-8)}</span>
                  <span className="text-xs text-white/30">
                    {inv.created ? new Date(inv.created).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-white/60 font-medium">${(inv.amount / 100).toLocaleString()}</span>
                  <span className={`text-[0.6rem] font-semibold px-2 py-0.5 rounded ${
                    inv.status === "paid" ? "text-green-400 bg-green-500/10" :
                    inv.status === "open" ? "text-blue-400 bg-blue-500/10" :
                    inv.status === "past_due" ? "text-red-400 bg-red-500/10" :
                    inv.status === "void" ? "text-white/20 bg-white/[0.04]" :
                    "text-white/30 bg-white/[0.04]"
                  }`}>
                    {inv.status === "past_due" ? "OVERDUE" : inv.status?.toUpperCase()}
                  </span>
                  {inv.hostedUrl && (
                    <a href={inv.hostedUrl} target="_blank" rel="noopener noreferrer" className="text-[0.6rem] text-blue-400/60 hover:text-blue-400 transition">
                      View
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Setup form — no billing yet or cancelled */}
      {(!billing || isCancelled) && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
          <div className="px-6 py-4 bg-white/[0.03] border-b border-white/[0.06]">
            <h2 className="text-sm font-semibold text-white/80">Set Up Billing</h2>
            <p className="text-xs text-white/30 mt-1">Send automated monthly invoices to your client via Stripe.</p>
          </div>
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[0.6rem] uppercase tracking-widest text-white/30 block mb-1.5">Monthly Amount ($)</label>
                <input
                  type="number"
                  min={1}
                  value={monthlyAmount}
                  onChange={(e) => setMonthlyAmount(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm border border-white/[0.08] rounded-lg bg-white/[0.04] text-white/70 focus:outline-none focus:border-white/20"
                />
              </div>
              <div>
                <label className="text-[0.6rem] uppercase tracking-widest text-white/30 block mb-1.5">Number of Months</label>
                <input
                  type="number"
                  min={1}
                  value={totalMonths}
                  onChange={(e) => setTotalMonths(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-2 text-sm border border-white/[0.08] rounded-lg bg-white/[0.04] text-white/70 focus:outline-none focus:border-white/20"
                />
              </div>
            </div>

            <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-[0.55rem] text-white/20">Per Month</div>
                  <div className="text-lg font-bold text-white/80">${monthlyAmount.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[0.55rem] text-white/20">Duration</div>
                  <div className="text-lg font-bold text-white/80">{totalMonths} mo</div>
                </div>
                <div>
                  <div className="text-[0.55rem] text-white/20">Total</div>
                  <div className="text-lg font-bold text-white/80">${(monthlyAmount * totalMonths).toLocaleString()}</div>
                </div>
              </div>
            </div>

            <div>
              <label className="text-[0.6rem] uppercase tracking-widest text-white/30 block mb-1.5">Client Email</label>
              <input
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="client@company.com"
                className="w-full px-3 py-2 text-sm border border-white/[0.08] rounded-lg bg-white/[0.04] text-white/70 placeholder:text-white/15 focus:outline-none focus:border-white/20"
              />
            </div>

            <button
              onClick={handleStartBilling}
              disabled={actionLoading || !clientEmail.trim() || monthlyAmount <= 0}
              className="w-full px-4 py-3 text-sm rounded-lg bg-green-500/20 text-green-400 font-semibold hover:bg-green-500/30 transition disabled:opacity-50"
            >
              {actionLoading ? "Setting up..." : "Start Billing"}
            </button>

            <p className="text-[0.6rem] text-white/20 text-center">
              Invoices are sent automatically each month via Stripe. Your client receives an email with a payment link.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
