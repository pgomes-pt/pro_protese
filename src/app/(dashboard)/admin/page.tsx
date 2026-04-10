"use client";

import type { UrgencyLevel, WorkStatus, WorkType } from "@prisma/client";
import { format, isToday } from "date-fns";
import { pt } from "date-fns/locale";
import {
  ClipboardList,
  Hammer,
  PackageCheck,
  PlusCircle,
  Settings,
  Truck,
} from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getExpectedDeliveryWindow } from "@/lib/dates";
import { AdminCapacityWidget } from "@/components/admin-capacity-widget";
import {
  STATUS_LABELS,
  URGENCY_LABELS,
  WORK_TYPE_LABELS,
} from "@/types";

type ClinicSummary = { id: string; name: string };

type OrderRow = {
  id: string;
  patientName: string | null;
  workType: WorkType;
  urgencyLevel: UrgencyLevel;
  status: WorkStatus;
  expectedDeliveryAt: string | null;
  deliveredAt: string | null;
  collectionDate: string | null;
  requestedAt: string;
  urgencyApproved: boolean | null;
  createdAt: string;
  clinic: ClinicSummary;
};

type UrgencyAvailability = {
  urgent: { limit: number; used: number; available: number };
  superUrgent: { limit: number; used: number; available: number };
  pendingUrgencyApprovals?: number;
};

const STATUS_BADGE: Record<WorkStatus, string> = {
  PEDIDO_FEITO: "bg-zinc-100 text-zinc-800 ring-zinc-200",
  RECOLHIDO: "bg-sky-100 text-sky-900 ring-sky-200",
  EM_PRODUCAO: "bg-amber-100 text-amber-950 ring-amber-200",
  CONCLUIDO: "bg-emerald-100 text-emerald-900 ring-emerald-200",
  ENTREGUE: "bg-green-800 text-white ring-green-900",
  DEVOLVIDO: "bg-red-100 text-red-900 ring-red-200",
  EM_ESPERA: "bg-orange-100 text-orange-950 ring-orange-200",
};

const ALL_STATUSES = Object.keys(STATUS_LABELS) as WorkStatus[];
const ALL_WORK_TYPES = Object.keys(WORK_TYPE_LABELS) as WorkType[];
const ALL_URGENCIES = Object.keys(URGENCY_LABELS) as UrgencyLevel[];

const REJECT_RETURN_REASON = "Urgência rejeitada pelo administrador";

type StatQuickFilterId =
  | "pedidos-hoje"
  | "urgencias-aprovar"
  | "em-producao"
  | "recolhas-hoje"
  | "entregas-hoje";

function matchesStatQuickFilter(
  o: OrderRow,
  f: StatQuickFilterId | null
): boolean {
  if (f === null) return true;
  switch (f) {
    case "pedidos-hoje":
      return isToday(new Date(o.requestedAt));
    case "urgencias-aprovar":
      return o.urgencyApproved === false && o.urgencyLevel !== "NORMAL";
    case "em-producao":
      return o.status === "EM_PRODUCAO";
    case "recolhas-hoje":
      return o.collectionDate != null && isToday(new Date(o.collectionDate));
    case "entregas-hoje":
      return (
        o.expectedDeliveryAt != null &&
        isToday(new Date(o.expectedDeliveryAt))
      );
    default:
      return true;
  }
}

function formatExpectedDelivery(expectedDeliveryAt: string | null): string {
  if (expectedDeliveryAt == null) return "A confirmar";
  const d = new Date(expectedDeliveryAt);
  const datePart = format(d, "d MMM yyyy", { locale: pt });
  const win = getExpectedDeliveryWindow(d);
  return `${datePart} · ${win}`;
}

function formatDateTime(iso: string): string {
  return format(new Date(iso), "d MMM yyyy, HH:mm", { locale: pt });
}

function StatsStripSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-3 sm:gap-4">
      <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
      <div className="h-14 min-w-0 flex-1 animate-pulse rounded-xl bg-slate-100 shadow-sm" />
    </div>
  );
}

function UrgencyRowSkeleton() {
  return (
    <div className="grid h-[72px] grid-cols-3 gap-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-xl bg-slate-100/90 shadow-sm"
        />
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="card-table-wrap animate-pulse">
      <div className="min-w-[1040px] divide-y divide-slate-100">
        <div className="flex gap-4 bg-slate-50 px-4 py-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-3 flex-1 rounded bg-zinc-200" />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, r) => (
          <div key={r} className="flex gap-4 px-4 py-4">
            {Array.from({ length: 8 }).map((_, c) => (
              <div key={c} className="h-4 flex-1 rounded bg-zinc-100" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: WorkStatus }) {
  const cls = STATUS_BADGE[status];
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function UrgencyBadge({ level }: { level: UrgencyLevel }) {
  if (level === "NORMAL") return <span className="text-zinc-500">—</span>;
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

function ModalBackdrop({
  children,
  onClose,
  title,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-900/10">
        <h2
          id="modal-title"
          className="font-heading text-lg font-semibold text-slate-900"
        >
          {title}
        </h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [urgencyAvail, setUrgencyAvail] = useState<UrgencyAvailability | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filterClinic, setFilterClinic] = useState("");
  const [filterStatus, setFilterStatus] = useState<WorkStatus | "">("");
  const [filterWorkType, setFilterWorkType] = useState<WorkType | "">("");
  const [filterUrgency, setFilterUrgency] = useState<UrgencyLevel | "">("");
  const [statQuickFilter, setStatQuickFilter] =
    useState<StatQuickFilterId | null>(null);

  const [rejectConfirmId, setRejectConfirmId] = useState<string | null>(null);
  const [urgencyActionId, setUrgencyActionId] = useState<string | null>(null);

  const [devolvidoModalOrderId, setDevolvidoModalOrderId] = useState<
    string | null
  >(null);
  const [devolvidoReason, setDevolvidoReason] = useState("");
  const [statusPatchId, setStatusPatchId] = useState<string | null>(null);

  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configMaxUrgent, setConfigMaxUrgent] = useState("");
  const [configMaxSuper, setConfigMaxSuper] = useState("");
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ordersRes, urgRes] = await Promise.all([
        fetch("/api/orders"),
        fetch("/api/orders/urgency-availability"),
      ]);

      if (!ordersRes.ok) {
        const errorBodyText = await ordersRes.text();
        console.error(
          "[admin dashboard] GET /api/orders failed:",
          ordersRes.status,
          ordersRes.statusText,
          errorBodyText
        );
        let errMsg = "Erro ao carregar pedidos.";
        try {
          const j = JSON.parse(errorBodyText) as { error?: unknown };
          if (typeof j.error === "string") errMsg = j.error;
        } catch {
          /* keep default */
        }
        throw new Error(errMsg);
      }

      const rawOrders = await ordersRes.json();
      const list: OrderRow[] = Array.isArray(rawOrders) ? rawOrders : [];
      setOrders(list);

      try {
        if (urgRes.ok) {
          const u = (await urgRes.json()) as UrgencyAvailability;
          setUrgencyAvail(u);
        } else {
          setUrgencyAvail(null);
        }
      } catch (urgE) {
        console.error(
          "[admin dashboard] urgency-availability response failed:",
          urgE
        );
        setUrgencyAvail(null);
      }
    } catch (e) {
      console.error("[admin dashboard] load() failed:", e);
      setOrders([]);
      setUrgencyAvail(null);
      setError(e instanceof Error ? e.message : "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleStatQuickFilter = useCallback((id: StatQuickFilterId) => {
    setStatQuickFilter((prev) => (prev === id ? null : id));
  }, []);

  useEffect(() => {
    if (configModalOpen && urgencyAvail) {
      setConfigMaxUrgent(String(urgencyAvail.urgent.limit));
      setConfigMaxSuper(String(urgencyAvail.superUrgent.limit));
      setConfigError(null);
    }
  }, [configModalOpen, urgencyAvail]);

  const stats = useMemo(() => {
    const totalToday = orders.filter((o) =>
      isToday(new Date(o.requestedAt))
    ).length;
    const pendingUrgencyApprovals = orders.filter(
      (o) => o.urgencyApproved === false && o.urgencyLevel !== "NORMAL"
    ).length;
    const inProduction = orders.filter((o) => o.status === "EM_PRODUCAO")
      .length;
    const collectToday = orders.filter(
      (o) =>
        o.collectionDate != null && isToday(new Date(o.collectionDate))
    ).length;
    const deliverToday = orders.filter(
      (o) =>
        o.expectedDeliveryAt != null &&
        isToday(new Date(o.expectedDeliveryAt))
    ).length;
    return {
      totalToday,
      pendingUrgencyApprovals,
      inProduction,
      collectToday,
      deliverToday,
    };
  }, [orders]);

  const pendingUrgencyOrders = useMemo(
    () =>
      orders.filter(
        (o) => o.urgencyApproved === false && o.urgencyLevel !== "NORMAL"
      ),
    [orders]
  );

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cq = filterClinic.trim().toLowerCase();
    return orders.filter((o) => {
      if (q) {
        const name = (o.patientName ?? "").toLowerCase();
        if (!name.includes(q)) return false;
      }
      if (cq) {
        const cn = (o.clinic?.name ?? "").toLowerCase();
        if (!cn.includes(cq)) return false;
      }
      if (filterStatus && o.status !== filterStatus) return false;
      if (filterWorkType && o.workType !== filterWorkType) return false;
      if (filterUrgency && o.urgencyLevel !== filterUrgency) return false;
      if (!matchesStatQuickFilter(o, statQuickFilter)) return false;
      return true;
    });
  }, [
    orders,
    search,
    filterClinic,
    filterStatus,
    filterWorkType,
    filterUrgency,
    statQuickFilter,
  ]);

  async function patchOrder(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        typeof j.error === "string" ? j.error : "Erro ao atualizar o pedido."
      );
    }
    return j;
  }

  async function handleApproveUrgency(id: string) {
    setUrgencyActionId(id);
    try {
      await patchOrder(id, { urgencyApproved: true });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao aprovar.");
    } finally {
      setUrgencyActionId(null);
    }
  }

  async function handleRejectUrgencyConfirmed(id: string) {
    setRejectConfirmId(null);
    setUrgencyActionId(id);
    try {
      await patchOrder(id, {
        urgencyApproved: false,
        status: "DEVOLVIDO",
        returnReason: REJECT_RETURN_REASON,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao rejeitar.");
    } finally {
      setUrgencyActionId(null);
    }
  }

  async function submitStatusChange(orderId: string, status: WorkStatus) {
    setStatusPatchId(orderId);
    try {
      await patchOrder(orderId, { status });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao atualizar estado.");
    } finally {
      setStatusPatchId(null);
    }
  }

  function onStatusSelectChange(order: OrderRow, value: string) {
    const next = value as WorkStatus;
    if (next === order.status) return;
    if (next === "DEVOLVIDO") {
      setDevolvidoModalOrderId(order.id);
      setDevolvidoReason("");
      return;
    }
    void submitStatusChange(order.id, next);
  }

  async function submitDevolvido() {
    if (!devolvidoModalOrderId) return;
    const reason = devolvidoReason.trim();
    if (!reason) {
      setError("Indique o motivo da devolução.");
      return;
    }
    setStatusPatchId(devolvidoModalOrderId);
    try {
      await patchOrder(devolvidoModalOrderId, {
        status: "DEVOLVIDO",
        returnReason: reason,
      });
      setDevolvidoModalOrderId(null);
      setDevolvidoReason("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao devolver.");
    } finally {
      setStatusPatchId(null);
    }
  }

  async function saveUrgencyConfig() {
    const u = Number.parseInt(configMaxUrgent, 10);
    const s = Number.parseInt(configMaxSuper, 10);
    if (!Number.isFinite(u) || !Number.isInteger(u) || u < 0) {
      setConfigError("Limite de urgências inválido.");
      return;
    }
    if (!Number.isFinite(s) || !Number.isInteger(s) || s < 0) {
      setConfigError("Limite de super urgências inválido.");
      return;
    }
    setConfigSaving(true);
    setConfigError(null);
    try {
      const res = await fetch("/api/admin/urgency-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxDailyUrgent: u,
          maxDailySuperUrgent: s,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof j.error === "string"
            ? j.error
            : "Erro ao guardar configuração."
        );
      }
      setConfigModalOpen(false);
      await load();
    } catch (e) {
      setConfigError(
        e instanceof Error ? e.message : "Erro ao guardar configuração."
      );
    } finally {
      setConfigSaving(false);
    }
  }

  return (
    <div className="dashboard-bg">
      <main className="mx-auto w-full max-w-[1600px] px-4 py-8">
        {error && (
          <div
            className="mb-6 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900 sm:flex-row sm:items-center sm:justify-between"
            role="alert"
          >
            <p className="text-sm">{error}</p>
            <button
              type="button"
              onClick={() => {
                setError(null);
                void load();
              }}
              className="shrink-0 rounded-lg bg-red-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800"
            >
              Tentar novamente
            </button>
          </div>
        )}

        <div className="space-y-6">
          {loading ? (
            <div className="flex flex-col gap-3">
              <StatsStripSkeleton />
              <UrgencyRowSkeleton />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3">
                <section className="flex min-w-0 flex-row flex-wrap items-center gap-3 sm:gap-4">
                  <span className="shrink-0 text-xs font-semibold uppercase tracking-widest text-slate-400">
                    Operações
                  </span>
                  <div className="min-w-0 w-full flex-1 basis-full rounded-xl bg-white px-6 py-4 shadow-sm sm:basis-0">
                  <div className="flex min-w-0 items-center justify-center gap-6 overflow-x-auto">
                    <button
                      type="button"
                      aria-pressed={statQuickFilter === "pedidos-hoje"}
                      onClick={() => toggleStatQuickFilter("pedidos-hoje")}
                      className={`flex min-w-[4.5rem] shrink-0 flex-col items-center gap-0.5 rounded-md px-2 py-0.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 ${
                        statQuickFilter === "pedidos-hoje"
                          ? "font-semibold underline decoration-2 decoration-slate-500 underline-offset-4"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <ClipboardList
                        className="size-4 shrink-0 text-slate-400"
                        aria-hidden
                      />
                      <span className="text-xl font-bold tabular-nums text-slate-900">
                        {stats.totalToday}
                      </span>
                      <span className="text-xs text-slate-400">Pedidos hoje</span>
                    </button>
                    <div
                      className="shrink-0 self-stretch border-r border-slate-100"
                      aria-hidden
                    />
                    <button
                      type="button"
                      aria-pressed={statQuickFilter === "em-producao"}
                      onClick={() => toggleStatQuickFilter("em-producao")}
                      className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-md px-2 py-0.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 ${
                        statQuickFilter === "em-producao"
                          ? "font-semibold underline decoration-2 decoration-blue-500 underline-offset-4"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <Hammer
                        className="size-4 shrink-0 text-blue-400"
                        aria-hidden
                      />
                      <span className="text-xl font-bold tabular-nums text-slate-900">
                        {stats.inProduction}
                      </span>
                      <span className="text-xs text-slate-400">Em produção</span>
                    </button>
                    <div
                      className="h-8 shrink-0 self-center border-r border-slate-100"
                      aria-hidden
                    />
                    <button
                      type="button"
                      aria-pressed={statQuickFilter === "recolhas-hoje"}
                      onClick={() => toggleStatQuickFilter("recolhas-hoje")}
                      className={`flex min-w-[4.5rem] shrink-0 flex-col items-center gap-0.5 rounded-md px-2 py-0.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 ${
                        statQuickFilter === "recolhas-hoje"
                          ? "font-semibold underline decoration-2 decoration-violet-500 underline-offset-4"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <PackageCheck
                        className="size-4 shrink-0 text-violet-400"
                        aria-hidden
                      />
                      <span className="text-xl font-bold tabular-nums text-slate-900">
                        {stats.collectToday}
                      </span>
                      <span className="text-xs text-slate-400">Recolhas hoje</span>
                    </button>
                    <div
                      className="shrink-0 self-stretch border-r border-slate-100"
                      aria-hidden
                    />
                    <button
                      type="button"
                      aria-pressed={statQuickFilter === "entregas-hoje"}
                      onClick={() => toggleStatQuickFilter("entregas-hoje")}
                      className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-md px-2 py-0.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 ${
                        statQuickFilter === "entregas-hoje"
                          ? "font-semibold underline decoration-2 decoration-emerald-500 underline-offset-4"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <Truck
                        className="size-4 shrink-0 text-emerald-400"
                        aria-hidden
                      />
                      <span className="text-xl font-bold tabular-nums text-slate-900">
                        {stats.deliverToday}
                      </span>
                      <span className="text-xs text-slate-400">Entregas hoje</span>
                    </button>
                    <div
                      className="shrink-0 self-stretch border-r border-slate-100"
                      aria-hidden
                    />
                    <div className="flex min-w-0 flex-1 items-center justify-center">
                      <Link
                        href="/admin/novo-pedido"
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                      >
                        <PlusCircle className="size-3.5 shrink-0" aria-hidden />
                        Novo Pedido
                      </Link>
                    </div>
                  </div>
                </div>
              </section>

              <section className="flex min-w-0 flex-row flex-wrap items-center gap-3 sm:gap-4">
                <span className="shrink-0 text-xs font-semibold uppercase tracking-widest text-slate-400">
                  Urgências
                </span>
                <div className="grid min-h-[72px] w-full min-w-0 flex-1 basis-full grid-cols-1 gap-3 sm:basis-0 sm:grid-cols-3">
                  <button
                    type="button"
                    aria-pressed={statQuickFilter === "urgencias-aprovar"}
                    onClick={() => toggleStatQuickFilter("urgencias-aprovar")}
                    className={`flex min-h-[72px] items-center justify-between rounded-xl border-l-4 border-amber-400 px-5 py-3 text-left shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 ${
                      statQuickFilter === "urgencias-aprovar"
                        ? "bg-amber-100"
                        : "bg-amber-50"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                        Por aprovar
                      </p>
                      <p className="text-lg font-bold tabular-nums text-amber-700">
                        {stats.pendingUrgencyApprovals}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center justify-end">
                      {stats.pendingUrgencyApprovals > 0 ? (
                        <span
                          className="inline-block size-2.5 animate-pulse rounded-full bg-amber-500 shadow-sm"
                          aria-hidden
                        />
                      ) : null}
                    </div>
                  </button>

                  {urgencyAvail ? (
                    <>
                      <div className="flex min-h-[72px] flex-col justify-center rounded-xl border-l-4 border-sky-400 bg-sky-50 px-5 py-3 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                              Urgências normais
                            </p>
                            <p className="text-lg font-bold tabular-nums text-sky-700">
                              {urgencyAvail.urgent.used}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs font-medium tabular-nums text-sky-700">
                            {urgencyAvail.urgent.used} /{" "}
                            {urgencyAvail.urgent.limit}
                          </span>
                        </div>
                        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-sky-200">
                          <div
                            className="h-full rounded-full bg-sky-500 transition-all duration-300"
                            style={{
                              width: `${urgencyAvail.urgent.limit > 0 ? Math.min(100, (urgencyAvail.urgent.used / urgencyAvail.urgent.limit) * 100) : 0}%`,
                            }}
                          />
                        </div>
                      </div>

                      <div className="relative flex min-h-[72px] flex-col justify-center rounded-xl border-l-4 border-rose-400 bg-rose-50 px-5 py-3 pr-10 shadow-sm">
                        <button
                          type="button"
                          onClick={() => setConfigModalOpen(true)}
                          className="absolute right-2 top-2 rounded p-1 text-rose-800 transition hover:bg-rose-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                          aria-label="Editar limites"
                        >
                          <Settings className="size-3.5" aria-hidden />
                        </button>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-900">
                              Super urgências
                            </p>
                            <p className="text-lg font-bold tabular-nums text-rose-700">
                              {urgencyAvail.superUrgent.used}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs font-medium tabular-nums text-rose-700">
                            {urgencyAvail.superUrgent.used} /{" "}
                            {urgencyAvail.superUrgent.limit}
                          </span>
                        </div>
                        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-rose-200">
                          <div
                            className="h-full rounded-full bg-rose-500 transition-all duration-300"
                            style={{
                              width: `${urgencyAvail.superUrgent.limit > 0 ? Math.min(100, (urgencyAvail.superUrgent.used / urgencyAvail.superUrgent.limit) * 100) : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex min-h-[72px] items-center rounded-xl border-l-4 border-sky-400 bg-sky-50 px-5 py-3 text-center text-[10px] font-medium uppercase tracking-wide text-sky-800 shadow-sm">
                        Urgências normais indisponíveis
                      </div>
                      <div className="relative flex min-h-[72px] items-center rounded-xl border-l-4 border-rose-400 bg-rose-50 px-5 py-3 pr-10 text-center text-[10px] font-medium uppercase tracking-wide text-rose-800 shadow-sm">
                        <button
                          type="button"
                          onClick={() => setConfigModalOpen(true)}
                          className="absolute right-2 top-2 rounded p-1 text-rose-800 transition hover:bg-rose-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                          aria-label="Editar limites"
                        >
                          <Settings className="size-3.5" aria-hidden />
                        </button>
                        Super urgências indisponíveis
                      </div>
                    </>
                  )}
                </div>
              </section>
              </div>
              <AdminCapacityWidget />
            </>
          )}

          {!loading && pendingUrgencyOrders.length > 0 && (
            <section className="card-alert-amber">
              <h2 className="font-heading text-lg font-semibold text-slate-900">
                Aprovação de urgências
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Pedidos à espera de decisão sobre o nível de urgência.
              </p>
              <ul className="mt-4 grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
                {pendingUrgencyOrders.map((o) => {
                  const busy = urgencyActionId === o.id;
                  return (
                    <li key={o.id} className="card-pending-item">
                      <div className="flex flex-col gap-2 text-sm">
                        <p className="font-semibold text-zinc-900">
                          {o.clinic.name}
                        </p>
                        <p className="text-zinc-700">
                          <span className="text-zinc-500">Paciente: </span>
                          {o.patientName?.trim() || "—"}
                        </p>
                        <p className="text-zinc-700">
                          <span className="text-zinc-500">Trabalho: </span>
                          {WORK_TYPE_LABELS[o.workType]}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-zinc-500">Urgência:</span>
                          <UrgencyBadge level={o.urgencyLevel} />
                        </div>
                        <p className="text-zinc-700">
                          <span className="text-zinc-500">
                            Entrega prevista:{" "}
                          </span>
                          {formatExpectedDelivery(o.expectedDeliveryAt)}
                        </p>
                        <p className="text-zinc-600">
                          <span className="text-zinc-500">Pedido em: </span>
                          {formatDateTime(o.requestedAt)}
                        </p>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleApproveUrgency(o.id)}
                          className="inline-flex flex-1 items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50 sm:flex-none"
                        >
                          Aprovar
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setRejectConfirmId(o.id)}
                          className="inline-flex flex-1 items-center justify-center rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50 sm:flex-none"
                        >
                          Rejeitar
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="mt-0 w-full">
            <div className="flex flex-wrap items-end gap-2 gap-y-2">
              <div className="min-w-[min(100%,140px)] flex-1 basis-[140px]">
                <label
                  htmlFor="filter-clinic"
                  className="block text-[11px] font-medium text-slate-600"
                >
                  Clínica
                </label>
                <input
                  id="filter-clinic"
                  type="search"
                  placeholder="Nome…"
                  value={filterClinic}
                  onChange={(e) => setFilterClinic(e.target.value)}
                  className="input-dashboard mt-0.5 w-full py-1.5 text-sm"
                />
              </div>
              <div className="min-w-[min(100%,140px)] flex-1 basis-[140px]">
                <label
                  htmlFor="search-patient"
                  className="block text-[11px] font-medium text-slate-600"
                >
                  Paciente
                </label>
                <input
                  id="search-patient"
                  type="search"
                  placeholder="Nome…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input-dashboard mt-0.5 w-full py-1.5 text-sm"
                />
              </div>
              <div className="min-w-[min(100%,120px)] flex-1 basis-[120px]">
                <label
                  htmlFor="filter-status"
                  className="block text-[11px] font-medium text-slate-600"
                >
                  Estado
                </label>
                <select
                  id="filter-status"
                  value={filterStatus}
                  onChange={(e) =>
                    setFilterStatus((e.target.value as WorkStatus) || "")
                  }
                  className="input-dashboard mt-0.5 w-full py-1.5 text-sm"
                >
                  <option value="">Todos</option>
                  {ALL_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-[min(100%,140px)] flex-1 basis-[160px]">
                <label
                  htmlFor="filter-work"
                  className="block text-[11px] font-medium text-slate-600"
                >
                  Tipo trabalho
                </label>
                <select
                  id="filter-work"
                  value={filterWorkType}
                  onChange={(e) =>
                    setFilterWorkType((e.target.value as WorkType) || "")
                  }
                  className="input-dashboard mt-0.5 w-full py-1.5 text-sm"
                >
                  <option value="">Todos</option>
                  {ALL_WORK_TYPES.map((w) => (
                    <option key={w} value={w}>
                      {WORK_TYPE_LABELS[w]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-[min(100%,120px)] flex-1 basis-[120px]">
                <label
                  htmlFor="filter-urgency"
                  className="block text-[11px] font-medium text-slate-600"
                >
                  Urgência
                </label>
                <select
                  id="filter-urgency"
                  value={filterUrgency}
                  onChange={(e) =>
                    setFilterUrgency((e.target.value as UrgencyLevel) || "")
                  }
                  className="input-dashboard mt-0.5 w-full py-1.5 text-sm"
                >
                  <option value="">Todas</option>
                  {ALL_URGENCIES.map((u) => (
                    <option key={u} value={u}>
                      {URGENCY_LABELS[u]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loading ? (
              <div className="mt-3 w-full">
                <TableSkeleton />
              </div>
            ) : orders.length === 0 && error ? (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-600">
                Não foi possível mostrar a lista. Utilize &quot;Tentar
                novamente&quot; acima.
              </div>
            ) : orders.length === 0 ? (
              <div className="card-panel-soft mt-3 border-dashed border-slate-300 px-6 py-16 text-center">
                <p className="font-heading text-lg font-medium text-slate-900">
                  Sem pedidos no sistema
                </p>
                <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
                  Quando as clínicas criarem pedidos, aparecerão aqui.
                </p>
              </div>
            ) : (
              <div className="card-panel-soft mt-3 w-full overflow-hidden p-0">
                <div className="border-b border-slate-200 bg-slate-50/90 px-4 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Todos os pedidos
                  </p>
                </div>
                <div className="w-full overflow-x-auto">
                  <table className="min-w-[1040px] w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                        <th className="px-4 py-3">Clínica</th>
                        <th className="px-4 py-3">Paciente</th>
                        <th className="px-4 py-3">Tipo de trabalho</th>
                        <th className="px-4 py-3">Urgência</th>
                        <th className="px-4 py-3">Estado</th>
                        <th className="px-4 py-3">Entrega prevista</th>
                        <th className="px-4 py-3">Criado em</th>
                        <th className="px-4 py-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredOrders.length === 0 ? (
                        <tr>
                          <td
                            colSpan={8}
                            className="px-4 py-10 text-center text-sm text-zinc-600"
                          >
                            Nenhum pedido corresponde aos filtros.
                          </td>
                        </tr>
                      ) : (
                        filteredOrders.map((o) => (
                          <tr
                            key={o.id}
                            className="transition hover:bg-zinc-50/80"
                          >
                            <td className="px-4 py-3 font-medium text-zinc-900">
                              {o.clinic?.name ?? "—"}
                            </td>
                            <td className="px-4 py-3 font-medium text-zinc-900">
                              {o.patientName?.trim() || "—"}
                            </td>
                            <td className="px-4 py-3 text-zinc-700">
                              {WORK_TYPE_LABELS[o.workType]}
                            </td>
                            <td className="px-4 py-3">
                              <UrgencyBadge level={o.urgencyLevel} />
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={o.status} />
                            </td>
                            <td className="px-4 py-3 text-zinc-700">
                              {formatExpectedDelivery(o.expectedDeliveryAt)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-zinc-600">
                              {formatDateTime(o.createdAt)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex flex-col items-end gap-2 sm:flex-row sm:justify-end sm:items-center">
                                <div className="flex w-full flex-col items-end sm:w-auto">
                                  <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                                    Atualizar estado
                                  </span>
                                  <select
                                    aria-label="Atualizar estado"
                                    disabled={statusPatchId === o.id}
                                    value={o.status}
                                    onChange={(e) =>
                                      onStatusSelectChange(o, e.target.value)
                                    }
                                    className="max-w-[220px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/25 disabled:opacity-50"
                                  >
                                    {ALL_STATUSES.map((s) => (
                                      <option key={s} value={s}>
                                        {STATUS_LABELS[s]}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <Link
                                  href={`/admin/pedidos/${o.id}`}
                                  className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/80"
                                >
                                  Ver detalhes
                                </Link>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      {rejectConfirmId && (
        <ModalBackdrop
          title="Rejeitar urgência"
          onClose={() => setRejectConfirmId(null)}
        >
          <p className="text-sm text-zinc-600">
            Tem a certeza de que deseja rejeitar esta urgência? O pedido será
            marcado como devolvido com o motivo indicado.
          </p>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setRejectConfirmId(null)}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleRejectUrgencyConfirmed(rejectConfirmId)}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Rejeitar
            </button>
          </div>
        </ModalBackdrop>
      )}

      {devolvidoModalOrderId && (
        <ModalBackdrop
          title="Motivo da devolução"
          onClose={() => {
            setDevolvidoModalOrderId(null);
            setDevolvidoReason("");
          }}
        >
          <p className="text-sm text-zinc-600">
            Indique o motivo da devolução. Este texto ficará registado no
            pedido.
          </p>
          <textarea
            value={devolvidoReason}
            onChange={(e) => setDevolvidoReason(e.target.value)}
            rows={3}
            className="input-dashboard mt-3 w-full"
            placeholder="Motivo…"
          />
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDevolvidoModalOrderId(null);
                setDevolvidoReason("");
              }}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={statusPatchId === devolvidoModalOrderId}
              onClick={() => void submitDevolvido()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Confirmar devolução
            </button>
          </div>
        </ModalBackdrop>
      )}

      {configModalOpen && (
        <ModalBackdrop
          title="Limites diários de urgência"
          onClose={() => !configSaving && setConfigModalOpen(false)}
        >
          <p className="text-sm text-zinc-600">
            Número máximo de pedidos por dia com urgência normal (URGENTE) e
            super urgência.
          </p>
          {configError && (
            <p className="mt-2 text-sm text-red-700" role="alert">
              {configError}
            </p>
          )}
          <div className="mt-4 space-y-3">
            <div>
              <label
                htmlFor="cfg-urgent"
                className="block text-xs font-medium text-zinc-600"
              >
                Máx. urgências normais / dia
              </label>
              <input
                id="cfg-urgent"
                type="number"
                min={0}
                value={configMaxUrgent}
                onChange={(e) => setConfigMaxUrgent(e.target.value)}
                className="input-dashboard mt-1 w-full"
              />
            </div>
            <div>
              <label
                htmlFor="cfg-super"
                className="block text-xs font-medium text-zinc-600"
              >
                Máx. super urgências / dia
              </label>
              <input
                id="cfg-super"
                type="number"
                min={0}
                value={configMaxSuper}
                onChange={(e) => setConfigMaxSuper(e.target.value)}
                className="input-dashboard mt-1 w-full"
              />
            </div>
          </div>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={configSaving}
              onClick={() => setConfigModalOpen(false)}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={configSaving}
              onClick={() => void saveUrgencyConfig()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {configSaving ? "A guardar…" : "Guardar"}
            </button>
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}
