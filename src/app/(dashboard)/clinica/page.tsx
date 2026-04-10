"use client";

import type {
  UrgencyLevel,
  WorkStatus,
  WorkType,
} from "@prisma/client";
import { format, isToday } from "date-fns";
import { pt } from "date-fns/locale";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  urgencyApproved: boolean | null;
  createdAt: string;
  clinic: ClinicSummary;
};

type WorkTypesMeta = {
  clinicName: string | null;
};

const STATUS_BADGE: Record<
  WorkStatus,
  string
> = {
  PEDIDO_FEITO:
    "bg-zinc-100 text-zinc-800 ring-zinc-200",
  RECOLHIDO:
    "bg-sky-100 text-sky-900 ring-sky-200",
  EM_PRODUCAO:
    "bg-amber-100 text-amber-950 ring-amber-200",
  CONCLUIDO:
    "bg-emerald-100 text-emerald-900 ring-emerald-200",
  ENTREGUE:
    "bg-green-800 text-white ring-green-900",
  DEVOLVIDO:
    "bg-red-100 text-red-900 ring-red-200",
  EM_ESPERA:
    "bg-orange-100 text-orange-950 ring-orange-200",
};

const ALL_STATUSES = Object.keys(STATUS_LABELS) as WorkStatus[];
const ALL_WORK_TYPES = Object.keys(WORK_TYPE_LABELS) as WorkType[];
const ALL_URGENCIES = Object.keys(URGENCY_LABELS) as UrgencyLevel[];

function formatExpectedDelivery(expectedDeliveryAt: string | null): string {
  if (expectedDeliveryAt == null) return "A confirmar";
  const d = new Date(expectedDeliveryAt);
  const datePart = format(d, "d MMM yyyy", { locale: pt });
  const win = getExpectedDeliveryWindow(d);
  return `${datePart} · ${win}`;
}

function formatCreatedAt(iso: string): string {
  return format(new Date(iso), "d MMM yyyy, HH:mm", { locale: pt });
}

function StatCardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="h-3 w-24 rounded bg-zinc-200" />
      <div className="mt-3 h-8 w-16 rounded bg-zinc-200" />
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="animate-pulse overflow-x-auto rounded-xl border border-zinc-200 bg-white">
      <div className="min-w-[900px] divide-y divide-zinc-100">
        <div className="flex gap-4 bg-zinc-50 px-4 py-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-3 flex-1 rounded bg-zinc-200" />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, r) => (
          <div key={r} className="flex gap-4 px-4 py-4">
            {Array.from({ length: 7 }).map((_, c) => (
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

export default function ClinicaDashboardPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [clinicNameMeta, setClinicNameMeta] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<WorkStatus | "">("");
  const [filterWorkType, setFilterWorkType] = useState<WorkType | "">("");
  const [filterUrgency, setFilterUrgency] = useState<UrgencyLevel | "">("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ordersRes, wtRes] = await Promise.all([
        fetch("/api/orders"),
        fetch("/api/work-types"),
      ]);

      if (!ordersRes.ok) {
        const j = await ordersRes.json().catch(() => ({}));
        throw new Error(
          typeof j.error === "string" ? j.error : "Erro ao carregar pedidos."
        );
      }

      const list = (await ordersRes.json()) as OrderRow[];
      setOrders(list);

      if (wtRes.ok) {
        const wt = (await wtRes.json()) as WorkTypesMeta;
        setClinicNameMeta(
          typeof wt.clinicName === "string" ? wt.clinicName : null
        );
      } else {
        setClinicNameMeta(null);
      }
    } catch (e) {
      setOrders([]);
      setClinicNameMeta(null);
      setError(e instanceof Error ? e.message : "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const displayClinicName = useMemo(() => {
    const fromOrder = orders[0]?.clinic?.name;
    return fromOrder ?? clinicNameMeta ?? "Clínica";
  }, [orders, clinicNameMeta]);

  const stats = useMemo(() => {
    const total = orders.length;
    const inProduction = orders.filter((o) => o.status === "EM_PRODUCAO")
      .length;
    const deliveredToday = orders.filter(
      (o) =>
        o.status === "ENTREGUE" &&
        o.deliveredAt != null &&
        isToday(new Date(o.deliveredAt))
    ).length;
    const pendingUrgency = orders.filter(
      (o) => o.urgencyApproved === false && o.urgencyLevel !== "NORMAL"
    ).length;
    return { total, inProduction, deliveredToday, pendingUrgency };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (q) {
        const name = (o.patientName ?? "").toLowerCase();
        if (!name.includes(q)) return false;
      }
      if (filterStatus && o.status !== filterStatus) return false;
      if (filterWorkType && o.workType !== filterWorkType) return false;
      if (filterUrgency && o.urgencyLevel !== filterUrgency) return false;
      return true;
    });
  }, [orders, search, filterStatus, filterWorkType, filterUrgency]);

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              {loading ? (
                <span className="inline-block h-8 w-48 max-w-full animate-pulse rounded bg-zinc-200" />
              ) : (
                displayClinicName
              )}
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Painel de pedidos e estatísticas
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/clinica/novo-pedido"
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800"
            >
              Novo Pedido
            </Link>
            <a
              href="/api/auth/logout"
              className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50"
            >
              Terminar sessão
            </a>
          </div>
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
              onClick={() => void load()}
              className="shrink-0 rounded-lg bg-red-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-zinc-500">
                Total de pedidos
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-900">
                {stats.total}
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
                Entregues hoje
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-green-800">
                {stats.deliveredToday}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-zinc-500">
                Urgências por aprovar
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-red-700">
                {stats.pendingUrgency}
              </p>
            </div>
          </div>
        )}

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-zinc-900">Pedidos</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Filtre e consulte o estado dos seus pedidos.
          </p>

          <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
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
          ) : error && orders.length === 0 ? (
            <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-600">
              Não foi possível mostrar a lista. Utilize &quot;Tentar novamente&quot;
              acima.
            </div>
          ) : orders.length === 0 ? (
            <div className="mt-8 rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
              <p className="text-lg font-medium text-zinc-900">
                Ainda não tem pedidos
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600">
                Quando criar o primeiro pedido, aparecerá aqui com o estado, datas
                e urgência.
              </p>
              <Link
                href="/clinica/novo-pedido"
                className="mt-6 inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800"
              >
                Criar primeiro pedido
              </Link>
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
              <table className="min-w-[920px] w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600">
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
                        colSpan={7}
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
                          {formatCreatedAt(o.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/clinica/pedidos/${o.id}`}
                            className="inline-flex rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50"
                          >
                            Ver detalhes
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
