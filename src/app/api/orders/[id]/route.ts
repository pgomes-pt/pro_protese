import { Prisma, UserRole, WorkStatus } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import {
  adminOverrideCapacity,
  releaseCapacity,
  reserveCapacity,
} from "@/lib/capacity";
import { prisma } from "@/lib/prisma";
import {
  computeExpectedDeliveryFromProductionDate,
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

function parseProductionDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return null;
  return new Date(t);
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
  _request: NextRequest,
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

  const workTypeConfig = await prisma.workTypeConfig.findUnique({
    where: { workType: order.workType },
  });

  const actorIds = [
    ...new Set(
      order.statusHistory
        .map((h) => h.changedBy)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];

  const actors =
    actorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true },
        })
      : [];

  const historyUserNames = Object.fromEntries(
    actors.map((a) => [a.id, a.name])
  );

  return NextResponse.json({
    ...order,
    workTypeConfig,
    historyUserNames,
  });
}

export async function PATCH(
  request: NextRequest,
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
  const { order: loaded, forbidden } = await loadOrderForUser(
    id,
    auth.dbUser
  );

  if (forbidden) {
    return jsonError(403, "Não tem permissão para atualizar este pedido.");
  }
  if (!loaded) {
    return jsonError(404, "Pedido não encontrado.");
  }

  let existing = loaded;

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
    "productionDate",
  ]);
  const unknown = Object.keys(body).filter((k) => !allowedKeys.has(k));
  if (unknown.length > 0) {
    return jsonError(
      400,
      `Campos não permitidos: ${unknown.join(", ")}.`
    );
  }

  if (
    body.productionDate !== undefined &&
    dbUser.role !== UserRole.ADMIN
  ) {
    return jsonError(
      403,
      "Apenas administradores podem alterar a data de produção."
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

  if (body.productionDate !== undefined) {
    const pd = parseProductionDate(body.productionDate);
    if (!pd) {
      return jsonError(400, "productionDate inválido.");
    }
    try {
      await adminOverrideCapacity(existing.id, pd);
    } catch (e) {
      console.error(e);
      return jsonError(500, "Erro ao atualizar a data de produção.");
    }
    const reloaded = await prisma.order.findUnique({
      where: { id: existing.id },
      include: orderFullInclude,
    });
    if (reloaded) {
      existing = reloaded;
    }
  }

  let status: WorkStatus | undefined;
  if (body.status !== undefined) {
    const parsed = parseWorkStatus(body.status);
    if (parsed === null) {
      return jsonError(400, "Estado inválido.");
    }
    status = parsed;
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

  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (urgencyApproved === false && dbUser.role === UserRole.ADMIN) {
        await releaseCapacity(existing.id, tx);
      }

      if (
        status === WorkStatus.ENTREGUE ||
        status === WorkStatus.DEVOLVIDO
      ) {
        await releaseCapacity(existing.id, tx);
      }

      if (urgencyApproved === true && dbUser.role === UserRole.ADMIN) {
        const workConfig = await tx.workTypeConfig.findUnique({
          where: { workType: existing.workType },
        });
        const pd =
          existing.productionDate ?? existing.collectionDate ?? new Date();
        const est =
          existing.estimatedHours ??
          (orderRequiresOutsourcing(existing.workType, workConfig)
            ? 0
            : workConfig?.estimatedHours ?? 0);
        await reserveCapacity(existing.id, pd, est, false, tx);
        if (!orderRequiresOutsourcing(existing.workType, workConfig)) {
          data.expectedDeliveryAt = computeExpectedDeliveryFromProductionDate(
            pd,
            existing.urgencyLevel,
            workConfig?.deadlineDays ?? null
          );
        }
        data.urgencyApprovedAt = new Date();
        data.urgencyApprovedBy = dbUser.id;
      }

      if (Object.keys(data).length > 0) {
        await tx.order.update({
          where: { id: existing.id },
          data,
        });
      }

      if (status !== undefined && status !== existing.status) {
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
