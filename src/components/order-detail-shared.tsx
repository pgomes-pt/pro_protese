"use client";

import type {
  UrgencyLevel,
  WorkStatus,
  WorkType,
} from "@prisma/client";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import type { ReactNode } from "react";
import { getExpectedDeliveryWindow } from "@/lib/dates";
import { orderRequiresOutsourcing } from "@/lib/order-logic";
import {
  STATUS_LABELS,
  URGENCY_LABELS,
  WORK_TYPE_LABELS,
} from "@/types";

export type OrderDetailPayload = {
  id: string;
  patientName: string | null;
  patientAge: number | null;
  workType: WorkType;
  urgencyLevel: UrgencyLevel;
  status: WorkStatus;
  createdAt: string;
  requestedAt: string;
  collectionDate: string | null;
  expectedDeliveryAt: string | null;
  notes: string | null;
  requirementsMet: boolean;
  requirementsWarning: boolean;
  urgencyApproved: boolean | null;
  returnReason: string | null;
  clinic: { id: string; name: string };
  user: { id: string; name: string; email: string };
  files: Array<{
    id: string;
    fileName: string;
    fileUrl: string;
    fileType: string | null;
  }>;
  statusHistory: Array<{
    id: string;
    status: WorkStatus;
    changedAt: string;
    changedBy: string | null;
    notes: string | null;
  }>;
  workTypeConfig: {
    requirements: string[];
    requiresOutsourcing: boolean;
    deadlineDays: number | null;
  } | null;
  historyUserNames: Record<string, string>;
};

export const STATUS_BADGE: Record<WorkStatus, string> = {
  PEDIDO_FEITO: "bg-zinc-100 text-zinc-800 ring-zinc-200",
  RECOLHIDO: "bg-sky-100 text-sky-900 ring-sky-200",
  EM_PRODUCAO: "bg-amber-100 text-amber-950 ring-amber-200",
  CONCLUIDO: "bg-emerald-100 text-emerald-900 ring-emerald-200",
  ENTREGUE: "bg-green-800 text-white ring-green-900",
  DEVOLVIDO: "bg-red-100 text-red-900 ring-red-200",
  EM_ESPERA: "bg-orange-100 text-orange-950 ring-orange-200",
};

export function StatusBadge({ status }: { status: WorkStatus }) {
  const cls = STATUS_BADGE[status];
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function UrgencyBadge({ level }: { level: UrgencyLevel }) {
  if (level === "NORMAL") {
    return <span className="text-zinc-500">—</span>;
  }
  if (level === "URGENTE") {
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-950 ring-1 ring-inset ring-amber-200">
        {URGENCY_LABELS[level]}
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-900 ring-1 ring-inset ring-red-200">
      {URGENCY_LABELS[level]}
    </span>
  );
}

export function WorkTypeBadge({ workType }: { workType: WorkType }) {
  return (
    <span className="inline-flex rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-950 ring-1 ring-inset ring-violet-200">
      {WORK_TYPE_LABELS[workType]}
    </span>
  );
}

export function formatCollectionLine(collectionDate: string | null): string {
  if (collectionDate == null) return "A confirmar";
  const d = new Date(collectionDate);
  const datePart = format(d, "d MMM yyyy", { locale: pt });
  return `${datePart} até às 10h00`;
}

export function formatExpectedDeliveryLine(
  expectedDeliveryAt: string | null,
  outsourcing: boolean
): string {
  if (outsourcing) return "A confirmar";
  if (expectedDeliveryAt == null) return "A confirmar";
  const d = new Date(expectedDeliveryAt);
  const datePart = format(d, "d MMM yyyy", { locale: pt });
  const win = getExpectedDeliveryWindow(d);
  return `${datePart} · ${win}`;
}

export function formatCreatedAt(iso: string): string {
  return format(new Date(iso), "d MMM yyyy, HH:mm", { locale: pt });
}

export function formatHistoryAt(iso: string): string {
  return format(new Date(iso), "d MMM yyyy, HH:mm", { locale: pt });
}

function cardClass() {
  return "card-panel-soft";
}

function FileTypeGlyph({ fileName, fileType }: { fileName: string; fileType: string | null }) {
  const lower = `${fileName} ${fileType ?? ""}`.toLowerCase();
  const isStl = lower.endsWith(".stl") || lower.includes(".stl");
  const isImage =
    /\.(jpe?g|png|gif|webp|heic|bmp|svg)(\?|$)/i.test(fileName) ||
    (fileType?.toLowerCase().startsWith("image/") ?? false);

  if (isImage) {
    return (
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-800"
        title="Imagem"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="8.5" cy="10" r="1.5" fill="currentColor" stroke="none" />
          <path d="M21 15l-5-5-4 4-2-2-4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (isStl) {
    return (
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-900"
        title="STL"
      >
        <span className="text-[10px] font-bold tracking-tight">STL</span>
      </span>
    );
  }
  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600"
      title="Ficheiro"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
      </svg>
    </span>
  );
}

export function OrderDetailSkeleton() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="animate-pulse space-y-6">
        <div className="card-stat-skeleton p-6">
          <div className="h-8 w-2/3 max-w-md rounded bg-zinc-200" />
          <div className="mt-3 h-4 w-40 rounded bg-zinc-100" />
          <div className="mt-4 flex flex-wrap gap-2">
            <div className="h-6 w-24 rounded-full bg-zinc-200" />
            <div className="h-6 w-28 rounded-full bg-zinc-200" />
            <div className="h-6 w-20 rounded-full bg-zinc-200" />
          </div>
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card-stat-skeleton">
            <div className="h-4 w-32 rounded bg-zinc-200" />
            <div className="mt-4 space-y-2">
              <div className="h-3 w-full rounded bg-zinc-100" />
              <div className="h-3 max-w-[85%] rounded bg-zinc-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OrderDetailBody({
  order,
  headerExtra,
  adminToolbar,
  footerActions,
}: {
  order: OrderDetailPayload;
  headerExtra?: ReactNode;
  adminToolbar?: ReactNode;
  footerActions: ReactNode;
}) {
  const outsourcing = orderRequiresOutsourcing(
    order.workType,
    order.workTypeConfig
  );
  const pendingUrgencyApproval =
    order.urgencyApproved === false &&
    order.urgencyLevel !== "NORMAL" &&
    order.status !== "DEVOLVIDO";
  const showReturnBanner =
    order.status === "DEVOLVIDO" &&
    (order.returnReason?.trim().length ?? 0) > 0;
  const requirementsList = order.workTypeConfig?.requirements ?? [];
  const notesTrimmed = order.notes?.trim() ?? "";

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <header className={`${cardClass()} mb-6`}>
        {headerExtra}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-slate-900">
              {order.patientName?.trim() || "Paciente sem nome"}
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              {order.patientAge != null
                ? `${order.patientAge} anos`
                : "Idade não indicada"}
            </p>
          </div>
          <p className="text-sm whitespace-nowrap text-zinc-500 sm:text-right">
            Criado em{" "}
            <span className="font-medium text-zinc-800">
              {formatCreatedAt(order.createdAt)}
            </span>
          </p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <WorkTypeBadge workType={order.workType} />
          <UrgencyBadge level={order.urgencyLevel} />
          <StatusBadge status={order.status} />
        </div>
        {adminToolbar ? <div className="mt-6 border-t border-zinc-100 pt-6">{adminToolbar}</div> : null}
      </header>

      {pendingUrgencyApproval ? (
        <div
          className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          Aguarda aprovação do administrador
        </div>
      ) : null}

      {showReturnBanner ? (
        <div
          className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          <p className="font-medium">Motivo da devolução</p>
          <p className="mt-1">{order.returnReason}</p>
        </div>
      ) : null}

      <div className="space-y-6">
        <section className={cardClass()}>
          <h2 className="font-heading text-sm font-semibold text-slate-900">
            Entrega e recolha
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-zinc-500">Data de recolha</dt>
              <dd className="mt-0.5 font-medium text-zinc-900">
                {formatCollectionLine(order.collectionDate)}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Entrega prevista</dt>
              <dd className="mt-0.5 font-medium text-zinc-900">
                {formatExpectedDeliveryLine(order.expectedDeliveryAt, outsourcing)}
              </dd>
            </div>
          </dl>
        </section>

        <section className={cardClass()}>
          <h2 className="font-heading text-sm font-semibold text-slate-900">
            Requisitos
          </h2>
          {order.requirementsWarning ? (
            <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-950">
              Este pedido foi submetido com requisitos incompletos. Pode ser
              devolvido.
            </div>
          ) : null}
          {requirementsList.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-600">
              Sem requisitos configurados para este tipo de trabalho.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {requirementsList.map((req) => (
                <li
                  key={req}
                  className="flex items-start gap-2 text-sm text-zinc-800"
                >
                  <span
                    className="mt-0.5 shrink-0 text-base"
                    aria-hidden
                  >
                    {order.requirementsMet ? (
                      <span className="text-emerald-600">✓</span>
                    ) : (
                      <span className="text-red-600">✗</span>
                    )}
                  </span>
                  <span>{req}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={cardClass()}>
          <h2 className="font-heading text-sm font-semibold text-slate-900">
            Notas
          </h2>
          <p className="mt-4 text-sm text-zinc-700">
            {notesTrimmed.length > 0 ? notesTrimmed : "Sem notas adicionais"}
          </p>
        </section>

        <section className={cardClass()}>
          <h2 className="font-heading text-sm font-semibold text-slate-900">
            Ficheiros
          </h2>
          {order.files.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-600">
              Sem ficheiros anexados
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-zinc-100">
              {order.files.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <FileTypeGlyph fileName={f.fileName} fileType={f.fileType} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900">
                      {f.fileName}
                    </p>
                  </div>
                  <a
                    href={f.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/80"
                  >
                    Descarregar
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={cardClass()}>
          <h2 className="font-heading text-sm font-semibold text-slate-900">
            Histórico de estado
          </h2>
          <ol className="mt-4 space-y-0">
            {order.statusHistory.map((h, idx) => {
              const actorName = h.changedBy
                ? (order.historyUserNames[h.changedBy] ?? "Utilizador")
                : "Sistema";
              const note = h.notes?.trim();
              return (
                <li key={h.id} className="relative flex gap-4 pb-8 last:pb-0">
                  {idx < order.statusHistory.length - 1 ? (
                    <span
                      className="absolute top-6 bottom-0 left-[11px] w-px bg-zinc-200"
                      aria-hidden
                    />
                  ) : null}
                  <span className="relative z-[1] mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-zinc-400 ring-4 ring-white" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={h.status} />
                      <span className="text-xs text-zinc-500">
                        {formatHistoryAt(h.changedAt)}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-600">
                      <span className="text-zinc-500">Alterado por: </span>
                      {actorName}
                    </p>
                    {note ? (
                      <p className="text-sm text-zinc-700">{note}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      <footer className="mt-10 flex flex-col gap-3 border-t border-zinc-200 pt-8 sm:flex-row sm:flex-wrap sm:items-center">
        {footerActions}
      </footer>
    </div>
  );
}
