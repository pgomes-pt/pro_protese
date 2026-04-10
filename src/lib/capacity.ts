import type { Prisma } from "@prisma/client";
import { WorkStatus } from "@prisma/client";
import { addDays, startOfDay } from "date-fns";
import { isWorkingDay } from "@/lib/dates";
import {
  computeExpectedDeliveryFromProductionDate,
  orderRequiresOutsourcing,
} from "@/lib/order-logic";
import { prisma } from "@/lib/prisma";

export const CAPACITY_STATUS = {
  CONFIRMED: "CONFIRMED",
  PROVISIONAL: "PROVISIONAL",
  MANUAL_OVERRIDE: "MANUAL_OVERRIDE",
  PROVISIONAL_REJECTED: "PROVISIONAL_REJECTED",
} as const;

const EXCLUDED_STATUSES: WorkStatus[] = [
  WorkStatus.ENTREGUE,
  WorkStatus.DEVOLVIDO,
  WorkStatus.EM_ESPERA,
];

const DEFAULT_MAX_HOURS = 7;

export type OrderWithClinic = Prisma.OrderGetPayload<{
  include: { clinic: true };
}>;

export async function getCapacityForDate(date: Date): Promise<{
  usedHours: number;
  maxHours: number;
  remainingHours: number;
  orders: OrderWithClinic[];
}> {
  const dayStart = startOfDay(date);
  const dayEnd = addDays(dayStart, 1);

  const labRow = await prisma.labConfig.findFirst({
    orderBy: { updatedAt: "desc" },
  });
  const maxHours = labRow?.maxDailyHours ?? DEFAULT_MAX_HOURS;

  const orders = await prisma.order.findMany({
    where: {
      productionDate: { gte: dayStart, lt: dayEnd },
      status: { notIn: EXCLUDED_STATUSES },
      capacityStatus: { not: CAPACITY_STATUS.PROVISIONAL_REJECTED },
    },
    include: { clinic: true },
    orderBy: { id: "asc" },
  });

  const usedHours = orders.reduce((s, o) => s + o.estimatedHours, 0);
  const remainingHours = Math.max(0, maxHours - usedHours);

  return { usedHours, maxHours, remainingHours, orders };
}

/**
 * First working day on or after `fromDate` where remaining capacity fits `requiredHours`.
 * Search is capped at 60 calendar days.
 */
export async function findFirstAvailableDate(
  fromDate: Date,
  requiredHours: number
): Promise<Date> {
  const start = startOfDay(fromDate);
  let fallback: Date | null = null;
  for (let i = 0; i < 60; i++) {
    const candidate = addDays(start, i);
    if (!isWorkingDay(candidate)) {
      continue;
    }
    const day = startOfDay(candidate);
    if (!fallback) fallback = day;
    const { remainingHours } = await getCapacityForDate(day);
    if (remainingHours >= requiredHours) {
      return day;
    }
  }
  return fallback ?? start;
}

export async function reserveCapacity(
  orderId: string,
  productionDate: Date,
  estimatedHours: number,
  isProvisional: boolean,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const db = tx ?? prisma;
  await db.order.update({
    where: { id: orderId },
    data: {
      productionDate: startOfDay(productionDate),
      estimatedHours,
      capacityStatus: isProvisional
        ? CAPACITY_STATUS.PROVISIONAL
        : CAPACITY_STATUS.CONFIRMED,
    },
  });
}

export async function releaseCapacity(
  orderId: string,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const db = tx ?? prisma;
  await db.order.update({
    where: { id: orderId },
    data: { capacityStatus: CAPACITY_STATUS.PROVISIONAL_REJECTED },
  });
}

export async function adminOverrideCapacity(
  orderId: string,
  newProductionDate: Date
): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    throw new Error("Pedido não encontrado.");
  }

  const workConfig = await prisma.workTypeConfig.findUnique({
    where: { workType: order.workType },
  });

  const outsourcing = orderRequiresOutsourcing(order.workType, workConfig);
  const expectedDeliveryAt = outsourcing
    ? null
    : computeExpectedDeliveryFromProductionDate(
        newProductionDate,
        order.urgencyLevel,
        workConfig?.deadlineDays ?? null
      );

  await prisma.order.update({
    where: { id: orderId },
    data: {
      productionDate: startOfDay(newProductionDate),
      capacityStatus: CAPACITY_STATUS.MANUAL_OVERRIDE,
      expectedDeliveryAt,
    },
  });
}
