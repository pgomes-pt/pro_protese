"use client";

import type { UrgencyLevel, WorkType } from "@prisma/client";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getExpectedDeliveryWindow } from "@/lib/dates";
import {
  computeCollectionDate,
  computeExpectedDeliveryAt,
  orderRequiresOutsourcing,
  SUPER_URGENCY_WORK_TYPES,
} from "@/lib/order-logic";
import {
  URGENCY_LABELS,
  WORK_TYPE_LABELS,
} from "@/types";

type UrgencyAvailability = {
  urgent: { limit: number; used: number; available: number };
  superUrgent: { limit: number; used: number; available: number };
  superUrgenciaManha: { available: boolean };
  superUrgenciaTarde: { available: boolean };
};

type WorkTypeRow = {
  id: string;
  workType: WorkType;
  deadlineDays: number | null;
  requiresOutsourcing: boolean;
  requirements: string[];
  allowedForNew: boolean;
};

type WorkTypesPayload = {
  clinicStatus: "NOVA" | "ATIVA" | null;
  workTypes: WorkTypeRow[];
};

function isCoreWorkType(w: WorkType): boolean {
  return (SUPER_URGENCY_WORK_TYPES as readonly string[]).includes(w);
}

function formatDateLong(d: Date): string {
  return format(d, "d 'de' MMMM 'de' yyyy", { locale: pt });
}

export default function NovoPedidoPage() {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date());
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [urgencyAvail, setUrgencyAvail] = useState<UrgencyAvailability | null>(
    null
  );
  const [workPayload, setWorkPayload] = useState<WorkTypesPayload | null>(null);

  const [patientName, setPatientName] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [workType, setWorkType] = useState<WorkType | "">("");
  const [urgencyLevel, setUrgencyLevel] = useState<UrgencyLevel>("NORMAL");
  const [notes, setNotes] = useState("");
  const [requirementChecks, setRequirementChecks] = useState<
    Record<string, boolean>
  >({});
  const [files, setFiles] = useState<File[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [requirementsModalOpen, setRequirementsModalOpen] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingData(true);
      setLoadError(null);
      try {
        const [uRes, wRes] = await Promise.all([
          fetch("/api/orders/urgency-availability"),
          fetch("/api/work-types"),
        ]);
        if (!uRes.ok) {
          const j = await uRes.json().catch(() => ({}));
          throw new Error(
            typeof j.error === "string" ? j.error : "Erro ao carregar urgências."
          );
        }
        if (!wRes.ok) {
          const j = await wRes.json().catch(() => ({}));
          throw new Error(
            typeof j.error === "string"
              ? j.error
              : "Erro ao carregar tipos de trabalho."
          );
        }
        const u = (await uRes.json()) as UrgencyAvailability;
        const w = (await wRes.json()) as WorkTypesPayload;
        if (!cancelled) {
          setUrgencyAvail(u);
          setWorkPayload(w);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Erro ao carregar dados.");
        }
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedConfig = useMemo(() => {
    if (!workType || !workPayload) return null;
    return workPayload.workTypes.find((c) => c.workType === workType) ?? null;
  }, [workType, workPayload]);

  useEffect(() => {
    const cfg = workPayload?.workTypes.find((c) => c.workType === workType);
    if (!cfg) {
      setRequirementChecks({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const r of cfg.requirements) {
      next[r] = false;
    }
    setRequirementChecks(next);
  }, [workType, workPayload]);

  const minutesFromMidnight = now.getHours() * 60 + now.getMinutes();
  const before10 = minutesFromMidnight < 10 * 60;
  const before13 = minutesFromMidnight < 13 * 60;
  const superSlotsLeft = urgencyAvail?.superUrgent.available ?? 0;

  const coreSelected = workType !== "" && isCoreWorkType(workType);

  const showUrgente = coreSelected;
  const showSuperManha =
    coreSelected && (urgencyAvail?.superUrgenciaManha.available ?? false);
  const showSuperTarde =
    coreSelected && (urgencyAvail?.superUrgenciaTarde.available ?? false);

  useEffect(() => {
    if (urgencyLevel === "URGENTE" && !showUrgente) {
      setUrgencyLevel("NORMAL");
    }
    if (urgencyLevel === "SUPER_URGENCIA_MANHA" && !showSuperManha) {
      setUrgencyLevel("NORMAL");
    }
    if (urgencyLevel === "SUPER_URGENCIA_TARDE" && !showSuperTarde) {
      setUrgencyLevel("NORMAL");
    }
  }, [urgencyLevel, showUrgente, showSuperManha, showSuperTarde]);

  const superManhaReason = useMemo(() => {
    if (!coreSelected || !urgencyAvail) return null;
    if (before10 && superSlotsLeft > 0) return null;
    if (!before10) return "Já passou das 10h00 — super urgência de manhã indisponível.";
    if (superSlotsLeft <= 0)
      return "Limite diário de super urgências atingido.";
    return null;
  }, [coreSelected, urgencyAvail, before10, superSlotsLeft]);

  const superTardeReason = useMemo(() => {
    if (!coreSelected || !urgencyAvail) return null;
    if (before13 && superSlotsLeft > 0) return null;
    if (!before13) return "Já passou das 13h00 — super urgência de tarde indisponível.";
    if (superSlotsLeft <= 0)
      return "Limite diário de super urgências atingido.";
    return null;
  }, [coreSelected, urgencyAvail, before13, superSlotsLeft]);

  const previewLines = useMemo(() => {
    if (!workType || !selectedConfig) return [];

    const outsourcing = orderRequiresOutsourcing(workType, selectedConfig);
    const lines: string[] = [];

    const collection = computeCollectionDate(now);
    lines.push(
      `Recolha prevista: ${formatDateLong(collection)} até às 10h00`
    );

    if (outsourcing) {
      lines.push(
        "Este trabalho depende de outsourcing. A data de entrega será confirmada posteriormente."
      );
      return lines;
    }

    if (urgencyLevel === "SUPER_URGENCIA_MANHA") {
      lines.push("Entrega prevista hoje até às 13h00");
      return lines;
    }
    if (urgencyLevel === "SUPER_URGENCIA_TARDE") {
      const win = getExpectedDeliveryWindow(
        new Date(now.getFullYear(), now.getMonth(), now.getDate())
      );
      lines.push(`Entrega prevista hoje entre as ${win}`);
      return lines;
    }

    const delivery = computeExpectedDeliveryAt(
      now,
      urgencyLevel,
      selectedConfig.deadlineDays
    );
    const win = getExpectedDeliveryWindow(delivery);
    lines.push(
      `Entrega prevista: ${formatDateLong(delivery)} entre as ${win}`
    );
    return lines;
  }, [workType, selectedConfig, urgencyLevel, now]);

  const allRequirementsChecked = useMemo(() => {
    if (!selectedConfig || selectedConfig.requirements.length === 0) return true;
    return selectedConfig.requirements.every((r) => requirementChecks[r] === true);
  }, [selectedConfig, requirementChecks]);

  const uploadFiles = useCallback(async (orderId: string, list: File[]) => {
    if (list.length === 0) return null;
    const fd = new FormData();
    for (const f of list) {
      fd.append("files", f);
    }
    const res = await fetch(`/api/orders/${orderId}/files`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return typeof j.error === "string" ? j.error : "Falha no envio de ficheiros.";
    }
    return null;
  }, []);

  const submitOrder = useCallback(async () => {
    setApiError(null);
    if (!patientName.trim()) {
      setApiError("Indique o nome do paciente.");
      return;
    }
    if (!workType) {
      setApiError("Selecione o tipo de trabalho.");
      return;
    }

    const ageNum = patientAge.trim() === "" ? null : Number(patientAge);
    if (
      patientAge.trim() !== "" &&
      (!Number.isFinite(ageNum) || ageNum! < 0)
    ) {
      setApiError("Idade inválida.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName: patientName.trim(),
          patientAge: ageNum,
          workType,
          urgencyLevel,
          notes: notes.trim() || undefined,
          requirementsMet: allRequirementsChecked,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setApiError(
          typeof data.error === "string" ? data.error : "Erro ao criar pedido."
        );
        return;
      }

      const order = data as {
        id: string;
        expectedDeliveryAt: string | null;
      };

      let fileErr: string | null = null;
      if (files.length > 0) {
        fileErr = await uploadFiles(order.id, files);
      }

      const deliveryHint =
        order.expectedDeliveryAt != null
          ? ` Entrega prevista: ${formatDateLong(new Date(order.expectedDeliveryAt))}.`
          : " A data de entrega será confirmada (outsourcing ou urgência em aprovação).";

      setSuccessMsg(
        fileErr
          ? `Pedido criado com sucesso.${deliveryHint} Nota: ${fileErr}`
          : `Pedido criado com sucesso.${deliveryHint}`
      );

      window.setTimeout(() => {
        router.push("/dashboard/clinica");
      }, 3000);
    } catch {
      setApiError("Erro de rede ao criar pedido.");
    } finally {
      setSubmitting(false);
    }
  }, [
    patientName,
    patientAge,
    workType,
    urgencyLevel,
    notes,
    allRequirementsChecked,
    files,
    uploadFiles,
    router,
  ]);

  const onSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!allRequirementsChecked) {
      setRequirementsModalOpen(true);
      return;
    }
    void submitOrder();
  };

  const urgencyOptions: { value: UrgencyLevel }[] = [
    { value: "NORMAL" },
    ...(showUrgente ? [{ value: "URGENTE" as const }] : []),
    ...(showSuperManha ? [{ value: "SUPER_URGENCIA_MANHA" as const }] : []),
    ...(showSuperTarde ? [{ value: "SUPER_URGENCIA_TARDE" as const }] : []),
  ];

  if (loadingData) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-lg items-center justify-center px-4">
        <p className="text-sm text-zinc-600">A carregar formulário…</p>
      </div>
    );
  }

  if (loadError || !workPayload || !urgencyAvail) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <p className="text-sm text-red-700">
          {loadError ?? "Não foi possível carregar os dados."}
        </p>
      </div>
    );
  }

  if (workPayload.workTypes.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12">
        <p className="text-sm text-zinc-700">
          Não há tipos de trabalho disponíveis para a sua clínica.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 pb-24">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Novo pedido
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Preencha os dados do paciente e do trabalho. Os prazos atualizam-se
          automaticamente.
        </p>
      </header>

      {successMsg && (
        <div
          className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          role="status"
        >
          {successMsg}
          <p className="mt-2 text-xs text-emerald-800">
            A redirecionar para o painel em 3 segundos…
          </p>
        </div>
      )}

      <form onSubmit={onSubmitForm} className="space-y-8">
        <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Paciente
          </h2>
          <div>
            <label
              htmlFor="patientName"
              className="block text-sm font-medium text-zinc-800"
            >
              Nome do paciente <span className="text-red-600">*</span>
            </label>
            <input
              id="patientName"
              type="text"
              required
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-base text-zinc-900 shadow-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
              autoComplete="name"
            />
          </div>
          <div>
            <label
              htmlFor="patientAge"
              className="block text-sm font-medium text-zinc-800"
            >
              Idade <span className="font-normal text-zinc-500">(opcional)</span>
            </label>
            <input
              id="patientAge"
              type="number"
              min={0}
              max={120}
              inputMode="numeric"
              value={patientAge}
              onChange={(e) => setPatientAge(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-base text-zinc-900 shadow-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Trabalho
          </h2>
          <div>
            <label
              htmlFor="workType"
              className="block text-sm font-medium text-zinc-800"
            >
              Tipo de trabalho <span className="text-red-600">*</span>
            </label>
            <select
              id="workType"
              required
              value={workType}
              onChange={(e) =>
                setWorkType((e.target.value || "") as WorkType | "")
              }
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base text-zinc-900 shadow-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            >
              <option value="">Selecione…</option>
              {workPayload.workTypes.map((c) => (
                <option key={c.id} value={c.workType}>
                  {WORK_TYPE_LABELS[c.workType]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="block text-sm font-medium text-zinc-800">
              Urgência
            </span>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {urgencyOptions.map(({ value }) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                    urgencyLevel === value
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 bg-zinc-50 text-zinc-800 hover:border-zinc-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="urgency"
                    value={value}
                    checked={urgencyLevel === value}
                    onChange={() => setUrgencyLevel(value)}
                    className="sr-only"
                  />
                  {URGENCY_LABELS[value]}
                </label>
              ))}
            </div>
            {coreSelected && (
              <div className="mt-3 space-y-1 text-xs text-zinc-600">
                {!showSuperManha && superManhaReason && (
                  <p>Super urgência manhã: {superManhaReason}</p>
                )}
                {!showSuperTarde && superTardeReason && (
                  <p>Super urgência tarde: {superTardeReason}</p>
                )}
              </div>
            )}
          </div>

          {selectedConfig && selectedConfig.requirements.length > 0 && (
            <div>
              <span className="block text-sm font-medium text-zinc-800">
                Requisitos
              </span>
              <p className="mt-1 text-xs text-zinc-500">
                Confirme que reúne o necessário para este tipo de trabalho.
              </p>
              <ul className="mt-2 space-y-2">
                {selectedConfig.requirements.map((req) => (
                  <li key={req}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={requirementChecks[req] === true}
                        onChange={(e) =>
                          setRequirementChecks((prev) => ({
                            ...prev,
                            [req]: e.target.checked,
                          }))
                        }
                        className="mt-0.5 size-4 rounded border-zinc-300 text-zinc-900"
                      />
                      <span className="text-sm text-zinc-800">{req}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <label
              htmlFor="notes"
              className="block text-sm font-medium text-zinc-800"
            >
              Notas <span className="font-normal text-zinc-500">(opcional)</span>
            </label>
            <textarea
              id="notes"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1.5 w-full resize-y rounded-lg border border-zinc-300 px-3 py-2.5 text-base text-zinc-900 shadow-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
          </div>

          <div>
            <label
              htmlFor="files"
              className="block text-sm font-medium text-zinc-800"
            >
              Ficheiros{" "}
              <span className="font-normal text-zinc-500">
                (imagens, .stl)
              </span>
            </label>
            <input
              id="files"
              type="file"
              multiple
              accept="image/*,.stl,model/stl,application/sla"
              onChange={(e) => {
                const list = e.target.files;
                setFiles(list ? Array.from(list) : []);
              }}
              className="mt-1.5 block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
            />
            {files.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-zinc-600">
                {files.map((f) => (
                  <li key={f.name + f.size}>{f.name}</li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/80 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Pré-visualização de prazos
          </h2>
          {!workType ? (
            <p className="mt-2 text-sm text-zinc-600">
              Selecione um tipo de trabalho para ver recolha e entrega previstas.
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm text-zinc-800">
              {previewLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </section>

        {apiError && (
          <p className="text-sm text-red-700" role="alert">
            {apiError}
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => router.push("/dashboard/clinica")}
            className="rounded-xl border border-zinc-300 px-5 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting || !!successMsg}
            className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <span
                  className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                  aria-hidden
                />
                A submeter…
              </span>
            ) : (
              "Submeter pedido"
            )}
          </button>
        </div>
      </form>

      {requirementsModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="req-modal-title"
        >
          <div className="max-h-[90vh] w-full max-w-md overflow-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3
              id="req-modal-title"
              className="text-lg font-semibold text-zinc-900"
            >
              Requisitos incompletos
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-zinc-600">
              Atenção: alguns requisitos não estão completos. O trabalho pode ser
              devolvido. Deseja continuar?
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setRequirementsModalOpen(false)}
                className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setRequirementsModalOpen(false);
                  void submitOrder();
                }}
                className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700"
              >
                Submeter mesmo assim
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
