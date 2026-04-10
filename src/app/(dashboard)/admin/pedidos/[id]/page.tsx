"use client";

import type { WorkStatus } from "@prisma/client";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  OrderDetailBody,
  type OrderDetailPayload,
  OrderDetailSkeleton,
} from "@/components/order-detail-shared";
import { STATUS_LABELS } from "@/types";

const ALL_STATUSES = Object.keys(STATUS_LABELS) as WorkStatus[];

const REJECT_RETURN_REASON = "Urgência rejeitada pelo administrador";

const btnSecondary =
  "inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/80";
const btnPrimary =
  "inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700";

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
      aria-labelledby="order-detail-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-900/10">
        <h2
          id="order-detail-modal-title"
          className="text-lg font-semibold text-zinc-900"
        >
          {title}
        </h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export default function AdminPedidoDetalhePage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  const [order, setOrder] = useState<OrderDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [urgencyBusy, setUrgencyBusy] = useState(false);
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [devolverOpen, setDevolverOpen] = useState(false);
  const [devolverReason, setDevolverReason] = useState("");

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      setError("Identificador do pedido em falta.");
      setOrder(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${id}`);
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(
          typeof j.error === "string" ? j.error : "Erro ao carregar o pedido."
        );
      }
      setOrder(j as OrderDetailPayload);
    } catch (e) {
      setOrder(null);
      setError(
        e instanceof Error ? e.message : "Erro ao carregar o pedido."
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchOrder(body: Record<string, unknown>) {
    if (!id) throw new Error("Pedido inválido.");
    const res = await fetch(`/api/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      throw new Error(
        typeof j.error === "string" ? j.error : "Erro ao atualizar o pedido."
      );
    }
    return j as OrderDetailPayload;
  }

  async function handleApproveUrgency() {
    setActionError(null);
    setUrgencyBusy(true);
    try {
      await patchOrder({ urgencyApproved: true });
      await load();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Erro ao aprovar a urgência."
      );
    } finally {
      setUrgencyBusy(false);
    }
  }

  async function handleRejectUrgencyConfirmed() {
    setRejectConfirmOpen(false);
    setActionError(null);
    setUrgencyBusy(true);
    try {
      await patchOrder({
        urgencyApproved: false,
        status: "DEVOLVIDO",
        returnReason: REJECT_RETURN_REASON,
      });
      await load();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Erro ao rejeitar a urgência."
      );
    } finally {
      setUrgencyBusy(false);
    }
  }

  async function submitStatusChange(next: WorkStatus) {
    setActionError(null);
    setStatusBusy(true);
    try {
      await patchOrder({ status: next });
      await load();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Erro ao atualizar o estado."
      );
    } finally {
      setStatusBusy(false);
    }
  }

  function onStatusSelectChange(value: string) {
    const next = value as WorkStatus;
    if (!order || next === order.status) return;
    if (next === "DEVOLVIDO") {
      setDevolverReason("");
      setDevolverOpen(true);
      return;
    }
    void submitStatusChange(next);
  }

  async function submitDevolver() {
    const reason = devolverReason.trim();
    if (!reason) {
      setActionError("Indique o motivo da devolução.");
      return;
    }
    setActionError(null);
    setStatusBusy(true);
    try {
      await patchOrder({ status: "DEVOLVIDO", returnReason: reason });
      setDevolverOpen(false);
      setDevolverReason("");
      await load();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Erro ao devolver o pedido."
      );
    } finally {
      setStatusBusy(false);
    }
  }

  function openDevolverFromButton() {
    setDevolverReason("");
    setDevolverOpen(true);
  }

  if (loading) {
    return (
      <div className="dashboard-bg">
        <OrderDetailSkeleton />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="dashboard-bg px-4 py-16">
        <div className="card-panel-soft mx-auto max-w-md p-8 text-center">
          <p className="text-sm text-zinc-800">
            {error ?? "Não foi possível mostrar este pedido."}
          </p>
          <Link
            href="/admin"
            className={`${btnPrimary} mt-6 w-full sm:w-auto`}
          >
            Voltar
          </Link>
        </div>
      </div>
    );
  }

  const pendingUrgency =
    order.urgencyApproved === false &&
    order.urgencyLevel !== "NORMAL" &&
    order.status !== "DEVOLVIDO";

  const adminToolbar = (
    <div className="flex flex-col gap-4">
      {actionError ? (
        <p className="text-sm text-red-700" role="alert">
          {actionError}
        </p>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-[200px] flex-1">
          <label
            htmlFor="admin-order-status"
            className="block text-xs font-medium text-zinc-600"
          >
            Atualizar estado
          </label>
          <select
            id="admin-order-status"
            disabled={statusBusy}
            value={order.status}
            onChange={(e) => onStatusSelectChange(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/30 disabled:opacity-50"
          >
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={statusBusy}
          onClick={openDevolverFromButton}
          className="inline-flex items-center justify-center rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-900 shadow-sm transition hover:bg-red-100 disabled:opacity-50 sm:shrink-0"
        >
          Devolver
        </button>
      </div>
      {pendingUrgency ? (
        <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
          <p className="w-full text-xs font-medium uppercase tracking-wide text-zinc-500">
            Aprovação de urgência
          </p>
          <button
            type="button"
            disabled={urgencyBusy}
            onClick={() => void handleApproveUrgency()}
            className="inline-flex flex-1 items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50 sm:flex-none"
          >
            Aprovar urgência
          </button>
          <button
            type="button"
            disabled={urgencyBusy}
            onClick={() => setRejectConfirmOpen(true)}
            className="inline-flex flex-1 items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50 sm:flex-none"
          >
            Rejeitar urgência
          </button>
        </div>
      ) : null}
    </div>
  );

  const headerExtra = (
    <p className="mb-4 text-sm font-medium text-zinc-600">
      Clínica:{" "}
      <span className="text-zinc-900">{order.clinic.name}</span>
    </p>
  );

  return (
    <div className="dashboard-bg">
      <OrderDetailBody
        order={order}
        headerExtra={headerExtra}
        adminToolbar={adminToolbar}
        footerActions={
          <Link href="/admin" className={btnSecondary}>
            Voltar
          </Link>
        }
      />

      {rejectConfirmOpen ? (
        <ModalBackdrop
          title="Rejeitar urgência"
          onClose={() => setRejectConfirmOpen(false)}
        >
          <p className="text-sm text-zinc-600">
            Tem a certeza de que deseja rejeitar esta urgência? O pedido será
            marcado como devolvido com o motivo indicado.
          </p>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setRejectConfirmOpen(false)}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={urgencyBusy}
              onClick={() => void handleRejectUrgencyConfirmed()}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              Rejeitar
            </button>
          </div>
        </ModalBackdrop>
      ) : null}

      {devolverOpen ? (
        <ModalBackdrop
          title="Motivo da devolução"
          onClose={() => {
            setDevolverOpen(false);
            setDevolverReason("");
          }}
        >
          <p className="text-sm text-zinc-600">
            Indique o motivo da devolução. Este texto ficará registado no
            pedido.
          </p>
          <textarea
            value={devolverReason}
            onChange={(e) => setDevolverReason(e.target.value)}
            rows={3}
            className="mt-3 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/30"
            placeholder="Motivo…"
          />
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={statusBusy}
              onClick={() => {
                setDevolverOpen(false);
                setDevolverReason("");
              }}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={statusBusy}
              onClick={() => void submitDevolver()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Confirmar devolução
            </button>
          </div>
        </ModalBackdrop>
      ) : null}
    </div>
  );
}
