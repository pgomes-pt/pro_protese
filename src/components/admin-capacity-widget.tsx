"use client";

import type { WorkType } from "@prisma/client";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { WORK_TYPE_LABELS } from "@/types";

type CapacityApi = {
  date: string;
  maxHours: number;
  usedHours: number;
  remainingHours: number;
  percentUsed: number;
  orders: {
    id: string;
    workType: WorkType;
    estimatedHours: number;
    patientName: string | null;
  }[];
};

function formatHours(n: number): string {
  const s = n.toFixed(1).replace(/\.0$/, "");
  return s;
}

function barToneClass(percent: number): string {
  if (percent < 70) return "bg-emerald-500";
  if (percent <= 90) return "bg-amber-500";
  return "bg-red-500";
}

function barTrackClass(percent: number): string {
  if (percent < 70) return "bg-emerald-100";
  if (percent <= 90) return "bg-amber-100";
  return "bg-red-100";
}

export function AdminCapacityWidget() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<CapacityApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [barPercent, setBarPercent] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/capacity");
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Erro ao carregar capacidade.");
      }
      const j = (await res.json()) as CapacityApi;
      setData(j);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Erro ao carregar capacidade.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data) return;
    setBarPercent(0);
    const id = window.requestAnimationFrame(() => {
      setBarPercent(Math.min(100, data.percentUsed));
    });
    return () => window.cancelAnimationFrame(id);
  }, [data]);

  if (loading && !data) {
    return (
      <section className="rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50/90 to-sky-50/50 p-5 shadow-sm">
        <div className="h-5 w-48 animate-pulse rounded bg-violet-100/80" />
        <div className="mt-4 h-3 w-full animate-pulse rounded-full bg-white/80" />
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-900">
        {error ?? "Capacidade indisponível."}
        <button
          type="button"
          onClick={() => void load()}
          className="ml-3 font-medium underline underline-offset-2"
        >
          Repetir
        </button>
      </section>
    );
  }

  const { maxHours, usedHours, percentUsed, orders } = data;
  const full = percentUsed >= 100;

  return (
    <section className="overflow-hidden rounded-2xl border border-violet-200/70 bg-gradient-to-br from-violet-50/95 via-white to-sky-50/40 shadow-sm shadow-violet-900/5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/50"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          {open ? (
            <ChevronDown className="size-4 shrink-0 text-violet-600" aria-hidden />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-violet-600" aria-hidden />
          )}
          <span className="font-heading text-sm font-semibold text-slate-800">
            Capacidade do dia — {formatHours(usedHours)}h utilizadas de{" "}
            {formatHours(maxHours)}h
          </span>
        </span>
      </button>

      {full && (
        <div
          className="mx-4 mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center text-sm font-medium text-red-900"
          role="status"
        >
          Capacidade máxima atingida para hoje
        </div>
      )}

      {open ? (
        <div className="border-t border-violet-100/80 px-4 pb-4 pt-2">
          <p className="mb-2 text-xs font-medium text-slate-500">
            Capacidade do dia — {formatHours(usedHours)}h utilizadas de{" "}
            {formatHours(maxHours)}h
          </p>
          <div
            className={`h-3 w-full overflow-hidden rounded-full ${barTrackClass(percentUsed)}`}
          >
            <div
              className={`h-full rounded-full transition-[width] duration-700 ease-out ${barToneClass(percentUsed)}`}
              style={{ width: `${barPercent}%` }}
            />
          </div>

          {orders.length > 0 ? (
            <ul className="mt-4 space-y-2 text-sm text-slate-700">
              {orders.map((o) => (
                <li
                  key={o.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-white/70 px-3 py-2 ring-1 ring-violet-100/80"
                >
                  <span className="font-medium text-slate-900">
                    {o.patientName?.trim() || "—"}
                  </span>
                  <span className="text-slate-600">
                    {WORK_TYPE_LABELS[o.workType]}{" "}
                    <span className="tabular-nums text-slate-500">
                      · {formatHours(o.estimatedHours)}h
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              Nenhum pedido conta para a capacidade neste dia.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
