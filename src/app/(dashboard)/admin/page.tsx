"use client";

import type { UrgencyLevel, WorkStatus, WorkType } from "@prisma/client";
import { format, isToday } from "date-fns";
import { pt } from "date-fns/locale";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getExpectedDeliveryWindow } from "@/lib/dates";
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

function StatCardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="h-3 w-28 rounded bg-zinc-200" />
      <div className="mt-3 h-8 w-16 rounded bg-zinc-200" />
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="animate-pulse overflow-x-auto rounded-xl border border-zinc-200 bg-white">
      <div className="min-w-[1040px] divide-y divide-zinc-100">
        <div className="flex gap-4 bg-zinc-50 px-4 py-3">
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
      <div className="relative z-10 w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-lg">
        <h2
          id="modal-title"
          className="text-lg font-semibold text-zinc-900"
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
        const j = await ordersRes.json().catch(() => ({}));
        throw new Error(
          typeof j.error === "string" ? j.error : "Erro ao carregar pedidos."
        );
      }

      const list = (await ordersRes.json()) as OrderRow[];
      setOrders(list);

      if (urgRes.ok) {
        const u = (await urgRes.json()) as UrgencyAvailability;
        setUrgencyAvail(u);
      } else {
        setUrgencyAvail(null);
      }
    } catch (e) {
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
      return true;
    });
  }, [orders, search, filterClinic, filterStatus, filterWorkType, filterUrgency]);

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
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              Painel de Administração
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Pedidos, urgências e capacidade diária
            </p>
          </div>
          <a
            href="/api/auth/logout"
            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50"
          >
            Terminar sessão
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
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

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1 space-y-6">
            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <StatCardSkeleton key={i} />
                ))}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <p className="text-sm font-medium text-zinc-500">
                    Total de pedidos hoje
                  </p>
                  <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-900">
                    {stats.totalToday}
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <p className="text-sm font-medium text-zinc-500">
                    Urgências por aprovar
                  </p>
                  <p className="mt-2 text-3xl font-semibold tabular-nums text-red-700">
                    {stats.pendingUrgencyApprovals}
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <p className="text-sm font-medium text-zinc-500">
                    Em produção
                  </p>
                  <p className="mt-2 text-3xl font-semibold tabular-nums text-amber-700">
                    {stats.inProduction}
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <p className="text-sm font-medium text-zinc-500">
                    Recolha prevista hoje
                  </p>
                  <p className="mt-2 text-3xl font-semibold tabular-nums text-sky-800">
                    {stats.collectToday}
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                  <p className="text-sm font-medium text-zinc-500">
                    Entrega prevista hoje
                  </p>
                  <p className="mt-2 text-3xl font-semibold tabular-nums text-green-800">
                    {stats.deliverToday}
                  </p>
                </div>
              </div>
            )}

            {!loading && pendingUrgencyOrders.length > 0 && (
              <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-zinc-900">
                  Aprovação de urgências
                </h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Pedidos à espera de decisão sobre o nível de urgência.
                </p>
                <ul className="mt-4 grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
                  {pendingUrgencyOrders.map((o) => {
                    const busy = urgencyActionId === o.id;
                    return (
                      <li
                        key={o.id}
                        className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
                      >
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

            <section>
              <h2 className="text-lg font-semibold text-zinc-900">
                Todos os pedidos
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                Filtre por clínica, paciente, estado e tipo de trabalho.
              </p>

              <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
                <div className="min-w-[180px] flex-1">
                  <label
                    htmlFor="filter-clinic"
                    className="block text-xs font-medium text-zinc-600"
                  >
                    Clínica
                  </label>
                  <input
                    id="filter-clinic"
                    type="search"
                    placeholder="Nome da clínica…"
                    value={filterClinic}
                    onChange={(e) => setFilterClinic(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/30"
                  />
                </div>
                <div className="min-w-[200px] flex-1">
                  <label
                    htmlFor="search-patient"
                    className="block text-xs font-medium text-zinc-600"
                  >
                    Paciente
                  </label>
                  <input
                    id="search-patient"
                    type="search"
                    placeholder="Pesquisar por nome…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/30"
                  />
                </div>
                <div className="w-full min-w-[160px] sm:w-auto">
                  <label
                    htmlFor="filter-status"
                    className="block text-xs font-medium text-zinc-600"
                  >
                    Estado
                  </label>
                  <select
                    id="filter-status"
                    value={filterStatus}
                    onChange={(e) =>
                      setFilterStatus((e.target.value as WorkStatus) || "")
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/30"
                  >
                    <option value="">Todos</option>
                    {ALL_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-full min-w-[180px] sm:w-auto">
                  <label
                    htmlFor="filter-work"
                    className="block text-xs font-medium text-zinc-600"
                  >
                    Tipo de trabalho
                  </label>
                  <select
                    id="filter-work"
                    value={filterWorkType}
                    onChange={(e) =>
                      setFilterWorkType((e.target.value as WorkType) || "")
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/30"
                  >
                    <option value="">Todos</option>
                    {ALL_WORK_TYPES.map((w) => (
                      <option key={w} value={w}>
                        {WORK_TYPE_LABELS[w]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-full min-w-[160px] sm:w-auto">
                  <label
                    htmlFor="filter-urgency"
                    className="block text-xs font-medium text-zinc-600"
                  >
                    Urgência
                  </label>
                  <select
                    id="filter-urgency"
                    value={filterUrgency}
                    onChange={(e) =>
                      setFilterUrgency((e.target.value as UrgencyLevel) || "")
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/30"
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
                <div className="mt-6">
                  <TableSkeleton />
                </div>
              ) : orders.length === 0 && error ? (
                <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-600">
                  Não foi possível mostrar a lista. Utilize &quot;Tentar
                  novamente&quot; acima.
                </div>
              ) : orders.length === 0 ? (
                <div className="mt-8 rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
                  <p className="text-lg font-medium text-zinc-900">
                    Sem pedidos no sistema
                  </p>
                  <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600">
                    Quando as clínicas criarem pedidos, aparecerão aqui.
                  </p>
                </div>
              ) : (
                <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
                  <table className="min-w-[1040px] w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600">
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
                    <tbody className="divide-y divide-zinc-100">
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
                                    className="max-w-[220px] rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs font-medium text-zinc-800 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/30 disabled:opacity-50"
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
                                  className="inline-flex rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50"
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
              )}
            </section>
          </div>

          <aside className="w-full shrink-0 lg:w-72">
            {loading ? (
              <div className="animate-pulse rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="h-4 w-40 rounded bg-zinc-200" />
                <div className="mt-4 h-4 w-full rounded bg-zinc-100" />
                <div className="mt-2 h-4 w-full rounded bg-zinc-100" />
                <div className="mt-4 h-9 w-full rounded bg-zinc-200" />
              </div>
            ) : urgencyAvail ? (
              <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-zinc-900">
                  Capacidade de urgências (hoje)
                </h3>
                <p className="mt-3 text-sm text-zinc-700">
                  Urgências normais:{" "}
                  <span className="font-semibold tabular-nums text-zinc-900">
                    {urgencyAvail.urgent.used} / {urgencyAvail.urgent.limit}
                  </span>
                </p>
                <p className="mt-2 text-sm text-zinc-700">
                  Super urgências:{" "}
                  <span className="font-semibold tabular-nums text-zinc-900">
                    {urgencyAvail.superUrgent.used} /{" "}
                    {urgencyAvail.superUrgent.limit}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => setConfigModalOpen(true)}
                  className="mt-4 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100"
                >
                  Editar limites
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-600">
                Não foi possível carregar a capacidade de urgências.
              </div>
            )}
          </aside>
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
            className="mt-3 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/30"
            placeholder="Motivo…"
          />
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDevolvidoModalOrderId(null);
                setDevolvidoReason("");
              }}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={statusPatchId === devolvidoModalOrderId}
              onClick={() => void submitDevolvido()}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
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
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/30"
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
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/30"
              />
            </div>
          </div>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={configSaving}
              onClick={() => setConfigModalOpen(false)}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={configSaving}
              onClick={() => void saveUrgencyConfig()}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {configSaving ? "A guardar…" : "Guardar"}
            </button>
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}
