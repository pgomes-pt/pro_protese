import { Prisma, UserRole, WorkStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  computeExpectedDeliveryAt,
  orderFullInclude,
  orderRequiresOutsourcing,
} from "@/lib/order-logic";

export const dynamic = "force-dynamic";

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

function parseWorkStatus(value: unknown): WorkStatus | null {
  if (typeof value !== "string") return null;
  return (Object.values(WorkStatus) as string[]).includes(value)
    ? (value as WorkStatus)
    : null;
}

async function loadOrderForUser(
  orderId: string,
  dbUser: { role: UserRole; clinicId: string | null }
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: orderFullInclude,
  });
  if (!order) return { order: null as null, forbidden: false };

  if (dbUser.role === UserRole.ADMIN) {
    return { order, forbidden: false };
  }
  if (dbUser.role === UserRole.CLINICA && dbUser.clinicId === order.clinicId) {
    return { order, forbidden: false };
  }
  return { order: null as null, forbidden: true };
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest();
  if (!auth.ok) {
    return jsonError(auth.status, auth.message);
  }

  const { id } = await ctx.params;
  const { order, forbidden } = await loadOrderForUser(id, auth.dbUser);

  if (forbidden) {
    return jsonError(403, "Não tem permissão para ver este pedido.");
  }
  if (!order) {
    return jsonError(404, "Pedido não encontrado.");
  }

  return NextResponse.json(order);
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest();
  if (!auth.ok) {
    return jsonError(auth.status, auth.message);
  }

  const { dbUser } = auth;
  if (dbUser.role === UserRole.ESTAFETA) {
    return jsonError(403, "Não tem permissão para atualizar pedidos.");
  }

  const { id } = await ctx.params;
  const { order: existing, forbidden } = await loadOrderForUser(
    id,
    auth.dbUser
  );

  if (forbidden) {
    return jsonError(403, "Não tem permissão para atualizar este pedido.");
  }
  if (!existing) {
    return jsonError(404, "Pedido não encontrado.");
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError(400, "Corpo do pedido inválido (JSON esperado).");
  }

  const allowedKeys = new Set([
    "status",
    "notes",
    "urgencyApproved",
    "returnReason",
  ]);
  const unknown = Object.keys(body).filter((k) => !allowedKeys.has(k));
  if (unknown.length > 0) {
    return jsonError(
      400,
      `Campos não permitidos: ${unknown.join(", ")}.`
    );
  }

  if (
    body.urgencyApproved !== undefined &&
    dbUser.role !== UserRole.ADMIN
  ) {
    return jsonError(
      403,
      "Apenas administradores podem alterar a aprovação de urgência."
    );
  }

  const status =
    body.status !== undefined ? parseWorkStatus(body.status) : undefined;
  if (body.status !== undefined && status === null) {
    return jsonError(400, "Estado inválido.");
  }

  let trimmedReturnReason: string | undefined;
  if (status === WorkStatus.DEVOLVIDO) {
    const reason =
      typeof body.returnReason === "string" ? body.returnReason.trim() : "";
    if (!reason) {
      return jsonError(
        400,
        "É obrigatório indicar o motivo da devolução (returnReason)."
      );
    }
    trimmedReturnReason = reason;
  }

  const notesUpdate =
    body.notes !== undefined
      ? typeof body.notes === "string"
        ? body.notes.trim() || null
        : null
      : undefined;

  let urgencyApproved: boolean | undefined;
  if (body.urgencyApproved !== undefined) {
    if (typeof body.urgencyApproved !== "boolean") {
      return jsonError(400, "urgencyApproved deve ser verdadeiro ou falso.");
    }
    urgencyApproved = body.urgencyApproved;
  }

  const statusChanged =
    status !== undefined && status !== existing.status;

  const data: Prisma.OrderUpdateInput = {};

  if (status !== undefined) data.status = status;
  if (notesUpdate !== undefined) data.notes = notesUpdate;
  if (urgencyApproved !== undefined) data.urgencyApproved = urgencyApproved;

  if (status === WorkStatus.ENTREGUE) {
    data.deliveredAt = new Date();
  }

  if (status === WorkStatus.DEVOLVIDO && trimmedReturnReason) {
    data.returnReason = trimmedReturnReason;
    data.returnedAt = new Date();
  }

  if (urgencyApproved === true && dbUser.role === UserRole.ADMIN) {
    const workConfig = await prisma.workTypeConfig.findUnique({
      where: { workType: existing.workType },
    });
    if (!orderRequiresOutsourcing(existing.workType, workConfig)) {
      data.expectedDeliveryAt = computeExpectedDeliveryAt(
        new Date(),
        existing.urgencyLevel,
        workConfig?.deadlineDays ?? null
      );
    }
    data.urgencyApprovedAt = new Date();
    data.urgencyApprovedBy = dbUser.id;
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.order.update({
          where: { id: existing.id },
          data,
        });
      }

      if (statusChanged && status !== undefined) {
        await tx.orderStatusHistory.create({
          data: {
            orderId: existing.id,
            status,
            changedBy: dbUser.id,
          },
        });
      }

      return tx.order.findUniqueOrThrow({
        where: { id: existing.id },
        include: orderFullInclude,
      });
    });

    return NextResponse.json(updated);
  } catch (e) {
    console.error(e);
    return jsonError(500, "Erro ao atualizar o pedido.");
  }
}
