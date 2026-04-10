"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  OrderDetailBody,
  type OrderDetailPayload,
  OrderDetailSkeleton,
} from "@/components/order-detail-shared";

const btnSecondary =
  "inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50";
const btnPrimary =
  "inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800";

export default function ClinicaPedidoDetalhePage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  const [order, setOrder] = useState<OrderDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <OrderDetailSkeleton />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-zinc-50 px-4 py-16">
        <div className="mx-auto max-w-md rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-zinc-800">
            {error ?? "Não foi possível mostrar este pedido."}
          </p>
          <Link
            href="/clinica"
            className={`${btnPrimary} mt-6 w-full sm:w-auto`}
          >
            Voltar
          </Link>
        </div>
      </div>
    );
  }

  const showResubmit =
    order.status === "EM_ESPERA" || order.status === "DEVOLVIDO";

  return (
    <div className="min-h-screen bg-zinc-50">
      <OrderDetailBody
        order={order}
        footerActions={
          <>
            <Link href="/clinica" className={btnSecondary}>
              Voltar
            </Link>
            {showResubmit ? (
              <Link
                href={`/clinica/novo-pedido?resubmit=${encodeURIComponent(order.id)}`}
                className={btnPrimary}
              >
                Corrigir e resubmeter
              </Link>
            ) : null}
          </>
        }
      />
    </div>
  );
}
