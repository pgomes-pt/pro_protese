"use client";

import type { WorkType } from "@prisma/client";
import { useCallback, useEffect, useState } from "react";
import { WORK_TYPE_LABELS } from "@/types";

type LabConfigRes = {
  id: string | null;
  maxDailyHours: number;
};

type WorkTypeConfigRow = {
  workType: WorkType;
  estimatedHours: number;
  requiresOutsourcing: boolean;
};

type UrgencyRow = {
  maxDailyUrgent: number;
  maxDailySuperUrgent: number;
  surchargePercent: number;
};

function Toast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      className="fixed bottom-6 right-6 z-[100] flex max-w-sm items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 shadow-lg shadow-emerald-900/10"
      role="status"
    >
      <p className="flex-1 font-medium">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded p-1 text-emerald-800 hover:bg-emerald-100/80"
        aria-label="Fechar"
      >
        ×
      </button>
    </div>
  );
}

export default function AdminConfiguracoesPage() {
  const [labLoading, setLabLoading] = useState(true);
  const [labError, setLabError] = useState<string | null>(null);
  const [maxDailyHours, setMaxDailyHours] = useState(7);
  const [rows, setRows] = useState<WorkTypeConfigRow[]>([]);
  const [labSaving, setLabSaving] = useState(false);

  const [urgLoading, setUrgLoading] = useState(true);
  const [urgError, setUrgError] = useState<string | null>(null);
  const [maxDailyUrgent, setMaxDailyUrgent] = useState("");
  const [maxDailySuperUrgent, setMaxDailySuperUrgent] = useState("");
  const [surchargePercent, setSurchargePercent] = useState("");
  const [urgSaving, setUrgSaving] = useState(false);

  const [toast, setToast] = useState<string | null>(null);

  const loadLab = useCallback(async () => {
    setLabLoading(true);
    setLabError(null);
    try {
      const res = await fetch("/api/admin/lab-config");
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        labConfig?: LabConfigRes;
        workTypeConfigs?: WorkTypeConfigRow[];
      };
      if (!res.ok) {
        throw new Error(j.error ?? "Erro ao carregar configuração do laboratório.");
      }
      if (j.labConfig) {
        setMaxDailyHours(j.labConfig.maxDailyHours);
      }
      if (Array.isArray(j.workTypeConfigs)) {
        setRows(j.workTypeConfigs);
      }
    } catch (e) {
      setLabError(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLabLoading(false);
    }
  }, []);

  const loadUrgency = useCallback(async () => {
    setUrgLoading(true);
    setUrgError(null);
    try {
      const res = await fetch("/api/admin/urgency-config");
      const j = (await res.json().catch(() => ({}))) as UrgencyRow & { error?: string };
      if (!res.ok) {
        throw new Error(j.error ?? "Erro ao carregar limites de urgência.");
      }
      setMaxDailyUrgent(String(j.maxDailyUrgent ?? 10));
      setMaxDailySuperUrgent(String(j.maxDailySuperUrgent ?? 5));
      setSurchargePercent(String(j.surchargePercent ?? 60));
    } catch (e) {
      setUrgError(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setUrgLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLab();
    void loadUrgency();
  }, [loadLab, loadUrgency]);

  function setHoursFor(workType: WorkType, value: number) {
    setRows((prev) =>
      prev.map((r) =>
        r.workType === workType ? { ...r, estimatedHours: value } : r
      )
    );
  }

  async function saveLab() {
    if (maxDailyHours < 1 || maxDailyHours > 24) {
      setLabError("Horas máximas devem estar entre 1 e 24.");
      return;
    }
    setLabSaving(true);
    setLabError(null);
    try {
      const workTypeUpdates = rows.map((r) => ({
        workType: r.workType,
        estimatedHours: r.estimatedHours,
      }));
      const res = await fetch("/api/admin/lab-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxDailyHours, workTypeUpdates }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof j.error === "string" ? j.error : "Erro ao guardar."
        );
      }
      if (Array.isArray(j.workTypeConfigs)) {
        setRows(j.workTypeConfigs);
      }
      if (j.labConfig?.maxDailyHours != null) {
        setMaxDailyHours(j.labConfig.maxDailyHours);
      }
      setToast("Configuração de capacidade guardada.");
      window.setTimeout(() => setToast(null), 4000);
    } catch (e) {
      setLabError(e instanceof Error ? e.message : "Erro ao guardar.");
    } finally {
      setLabSaving(false);
    }
  }

  async function saveUrgency() {
    const u = Number.parseInt(maxDailyUrgent, 10);
    const s = Number.parseInt(maxDailySuperUrgent, 10);
    const p = Number.parseFloat(surchargePercent.replace(",", "."));
    if (!Number.isFinite(u) || !Number.isInteger(u) || u < 0) {
      setUrgError("Limite de urgências inválido.");
      return;
    }
    if (!Number.isFinite(s) || !Number.isInteger(s) || s < 0) {
      setUrgError("Limite de super urgências inválido.");
      return;
    }
    if (!Number.isFinite(p) || p < 0) {
      setUrgError("Sobretaxa de urgência inválida.");
      return;
    }
    setUrgSaving(true);
    setUrgError(null);
    try {
      const res = await fetch("/api/admin/urgency-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxDailyUrgent: u,
          maxDailySuperUrgent: s,
          surchargePercent: p,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof j.error === "string" ? j.error : "Erro ao guardar."
        );
      }
      setToast("Limites de urgência guardados.");
      window.setTimeout(() => setToast(null), 4000);
      await loadUrgency();
    } catch (e) {
      setUrgError(e instanceof Error ? e.message : "Erro ao guardar.");
    } finally {
      setUrgSaving(false);
    }
  }

  return (
    <div className="dashboard-bg min-h-[calc(100vh-57px)] lg:min-h-screen">
      <main className="mx-auto w-full max-w-[960px] px-4 py-8">
        <h1 className="font-heading text-2xl font-semibold text-slate-900">
          Configurações
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Capacidade diária do laboratório e limites de urgência.
        </p>

        <div className="mt-8 space-y-8">
          <section className="card-panel-soft border-slate-200/80 p-6">
            <h2 className="font-heading text-lg font-semibold text-slate-900">
              Capacidade diária
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Horas disponíveis por dia e tempo estimado por tipo de trabalho.
            </p>

            {labLoading ? (
              <div className="mt-6 space-y-3 animate-pulse">
                <div className="h-10 rounded-lg bg-slate-100" />
                <div className="h-32 rounded-lg bg-slate-100" />
              </div>
            ) : (
              <>
                {labError && (
                  <p className="mt-4 text-sm text-red-700" role="alert">
                    {labError}
                  </p>
                )}
                <div className="mt-6 max-w-xs">
                  <label
                    htmlFor="max-daily-hours"
                    className="block text-xs font-medium text-slate-600"
                  >
                    Horas máximas por dia
                  </label>
                  <input
                    id="max-daily-hours"
                    type="number"
                    min={1}
                    max={24}
                    step={0.5}
                    value={maxDailyHours}
                    onChange={(e) =>
                      setMaxDailyHours(Number.parseFloat(e.target.value) || 0)
                    }
                    className="input-dashboard mt-1 w-full"
                  />
                </div>

                <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200/80 bg-white/80">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/90 text-xs font-semibold uppercase tracking-wide text-slate-600">
                        <th className="px-4 py-3">Tipo de trabalho</th>
                        <th className="px-4 py-3">Horas estimadas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((r) => {
                        const outsourcing =
                          r.estimatedHours === 0 && r.requiresOutsourcing;
                        return (
                          <tr key={r.workType} className="hover:bg-slate-50/60">
                            <td className="px-4 py-3 font-medium text-slate-900">
                              {WORK_TYPE_LABELS[r.workType]}
                            </td>
                            <td className="px-4 py-3">
                              {outsourcing ? (
                                <span className="text-slate-500">Outsourcing</span>
                              ) : (
                                <input
                                  type="number"
                                  min={0}
                                  step={0.5}
                                  value={r.estimatedHours}
                                  onChange={(e) =>
                                    setHoursFor(
                                      r.workType,
                                      Number.parseFloat(e.target.value) || 0
                                    )
                                  }
                                  className="input-dashboard w-28 py-1.5 text-sm"
                                />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-6">
                  <button
                    type="button"
                    disabled={labSaving}
                    onClick={() => void saveLab()}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    {labSaving ? "A guardar…" : "Guardar alterações"}
                  </button>
                </div>
              </>
            )}
          </section>

          <section className="card-panel-soft border-slate-200/80 p-6">
            <h2 className="font-heading text-lg font-semibold text-slate-900">
              Limites de urgência
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Pedidos urgentes permitidos por dia e percentagem de sobretaxa.
            </p>

            {urgLoading ? (
              <div className="mt-6 space-y-3 animate-pulse">
                <div className="h-10 rounded-lg bg-slate-100" />
                <div className="h-10 rounded-lg bg-slate-100" />
              </div>
            ) : (
              <>
                {urgError && (
                  <p className="mt-4 text-sm text-red-700" role="alert">
                    {urgError}
                  </p>
                )}
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  <div>
                    <label
                      htmlFor="max-urgent"
                      className="block text-xs font-medium text-slate-600"
                    >
                      Máx. urgências / dia
                    </label>
                    <input
                      id="max-urgent"
                      type="number"
                      min={0}
                      value={maxDailyUrgent}
                      onChange={(e) => setMaxDailyUrgent(e.target.value)}
                      className="input-dashboard mt-1 w-full"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="max-super"
                      className="block text-xs font-medium text-slate-600"
                    >
                      Máx. super urgências / dia
                    </label>
                    <input
                      id="max-super"
                      type="number"
                      min={0}
                      value={maxDailySuperUrgent}
                      onChange={(e) => setMaxDailySuperUrgent(e.target.value)}
                      className="input-dashboard mt-1 w-full"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="surcharge"
                      className="block text-xs font-medium text-slate-600"
                    >
                      Sobretaxa de urgência (%)
                    </label>
                    <input
                      id="surcharge"
                      type="number"
                      min={0}
                      step={0.5}
                      value={surchargePercent}
                      onChange={(e) => setSurchargePercent(e.target.value)}
                      className="input-dashboard mt-1 w-full"
                    />
                  </div>
                </div>

                <div className="mt-6">
                  <button
                    type="button"
                    disabled={urgSaving}
                    onClick={() => void saveUrgency()}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    {urgSaving ? "A guardar…" : "Guardar alterações"}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </main>

      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  );
}
