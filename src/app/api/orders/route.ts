import {
  ClinicStatus,
  UrgencyLevel,
  UserRole,
  WorkStatus,
  WorkType,
} from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  findFirstAvailableDate,
  reserveCapacity,
} from "@/lib/capacity";
import {
  NOVA_CLINIC_WORK_TYPES,
  OUTSOURCING_DELIVERY_NOTE,
  SUPER_URGENCY_WORK_TYPES,
  computeCollectionDate,
  computeExpectedDeliveryFromProductionDate,
  isSuperUrgency,
  orderRequiresOutsourcing,
  localDayRange,
  orderFullInclude,
} from "@/lib/order-logic";
import { startOfDay } from "date-fns";

export const dynamic = "force-dynamic";

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

function parseWorkType(value: unknown): WorkType | null {
  if (typeof value !== "string") return null;
  return (Object.values(WorkType) as string[]).includes(value)
    ? (value as WorkType)
    : null;
}

function parseUrgencyLevel(value: unknown): UrgencyLevel | null {
  if (typeof value !== "string") return null;
  return (Object.values(UrgencyLevel) as string[]).includes(value)
    ? (value as UrgencyLevel)
    : null;
}

export async function GET() {
  const auth = await authenticateRequest();
  if (!auth.ok) {
    return jsonError(auth.status, auth.message);
  }

  const { dbUser } = auth;
  if (dbUser.role === UserRole.ESTAFETA) {
    return jsonError(403, "Não tem permissão para consultar pedidos.");
  }

  if (dbUser.role === UserRole.CLINICA && !dbUser.clinicId) {
    return jsonError(403, "Conta de clínica sem clínica associada.");
  }

  try {
    const orders = await prisma.order.findMany({
      where:
        dbUser.role === UserRole.ADMIN
          ? {}
          : { clinicId: dbUser.clinicId! },
      include: orderFullInclude,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(orders);
  } catch (e) {
    console.error("[GET /api/orders]", e);
    return jsonError(500, "Erro ao carregar pedidos.");
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest();
  if (!auth.ok) {
    return jsonError(auth.status, auth.message);
  }

  const { dbUser } = auth;
  if (dbUser.role !== UserRole.CLINICA || !dbUser.clinicId) {
    return jsonError(
      403,
      "Apenas utilizadores de clínica podem criar pedidos."
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError(400, "Corpo do pedido inválido (JSON esperado).");
  }

  const workType = parseWorkType(body.workType);
  const urgencyLevel = parseUrgencyLevel(body.urgencyLevel);
  const patientName =
    typeof body.patientName === "string" ? body.patientName.trim() : "";

  if (!workType) {
    return jsonError(400, "Tipo de trabalho inválido ou em falta.");
  }
  if (!urgencyLevel) {
    return jsonError(400, "Nível de urgência inválido ou em falta.");
  }
  if (!patientName) {
    return jsonError(400, "O nome do paciente é obrigatório.");
  }

  const now = new Date();

  try {
    const [clinic, workConfig, urgencyConfig] = await Promise.all([
      prisma.clinic.findUnique({ where: { id: dbUser.clinicId } }),
      prisma.workTypeConfig.findUnique({ where: { workType } }),
      prisma.urgencyConfig.findFirst({ orderBy: { updatedAt: "desc" } }),
    ]);

    if (!clinic) {
      return jsonError(404, "Clínica não encontrada.");
    }

    if (clinic.status === ClinicStatus.NOVA) {
      const allowed = (NOVA_CLINIC_WORK_TYPES as readonly string[]).includes(
        workType
      );
      if (!allowed) {
        return jsonError(
          403,
          "Este tipo de trabalho não está disponível para clínicas novas."
        );
      }
    }

    if (isSuperUrgency(urgencyLevel)) {
      const coreOk = (SUPER_URGENCY_WORK_TYPES as readonly string[]).includes(
        workType
      );
      if (!coreOk) {
        return jsonError(
          403,
          "Super urgência só é permitida para os tipos de trabalho base (reparação, acréscimos, rebase e contenção)."
        );
      }

      const maxSuper = urgencyConfig?.maxDailySuperUrgent ?? 5;
      const { start, end } = localDayRange(now);
      const superCount = await prisma.order.count({
        where: {
          createdAt: { gte: start, lt: end },
          urgencyLevel: {
            in: ["SUPER_URGENCIA_MANHA", "SUPER_URGENCIA_TARDE"],
          },
        },
      });

      if (superCount >= maxSuper) {
        return jsonError(
          429,
          "Limite diário de super urgências atingido."
        );
      }
    }

    const outsourcing = orderRequiresOutsourcing(workType, workConfig);
    let notes: string | null =
      typeof body.notes === "string" && body.notes.trim()
        ? body.notes.trim()
        : null;
    if (outsourcing) {
      notes = notes
        ? `${notes}\n\n${OUTSOURCING_DELIVERY_NOTE}`
        : OUTSOURCING_DELIVERY_NOTE;
    }

    const requirementsMet = body.requirementsMet === true;
    const requirementsWarning = !requirementsMet;

    const deadlineDays = workConfig?.deadlineDays ?? null;
    const collectionDate = computeCollectionDate(now);

    let estimatedHours = workConfig?.estimatedHours ?? 0;
    let productionDate: Date;

    if (outsourcing) {
      estimatedHours = 0;
      productionDate = startOfDay(collectionDate);
    } else {
      estimatedHours = workConfig?.estimatedHours ?? 0;
      productionDate = await findFirstAvailableDate(
        startOfDay(collectionDate),
        estimatedHours
      );
    }

    const isProvisional = isSuperUrgency(urgencyLevel);
    const expectedDeliveryAt = outsourcing
      ? null
      : computeExpectedDeliveryFromProductionDate(
          productionDate,
          urgencyLevel,
          deadlineDays
        );

    const patientAge =
      typeof body.patientAge === "number" &&
      Number.isFinite(body.patientAge) &&
      body.patientAge >= 0
        ? Math.floor(body.patientAge)
        : null;

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          clinicId: dbUser.clinicId!,
          userId: dbUser.id,
          workType,
          urgencyLevel,
          patientName,
          patientAge,
          notes,
          requirementsMet,
          requirementsWarning,
          collectionDate,
          expectedDeliveryAt,
          urgencyApproved: isSuperUrgency(urgencyLevel) ? false : null,
        },
      });

      await reserveCapacity(
        created.id,
        productionDate,
        estimatedHours,
        isProvisional,
        tx
      );

      await tx.orderStatusHistory.create({
        data: {
          orderId: created.id,
          status: WorkStatus.PEDIDO_FEITO,
          changedBy: dbUser.id,
        },
      });

      return tx.order.findUniqueOrThrow({
        where: { id: created.id },
        include: orderFullInclude,
      });
    });

    return NextResponse.json(order, { status: 201 });
  } catch (e) {
    console.error(e);
    return jsonError(500, "Erro ao criar o pedido.");
  }
}
