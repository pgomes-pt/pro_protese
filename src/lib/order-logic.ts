import type { Prisma, UrgencyLevel, WorkType } from "@prisma/client";
import { addDays, startOfDay } from "date-fns";
import { calculateDeadline, getNextWorkingDay } from "@/lib/dates";

/** Tipos de trabalho permitidos para clínicas com estado NOVA. */
export const NOVA_CLINIC_WORK_TYPES: readonly WorkType[] = [
  "REPARACAO",
  "ACRESCIMO_DENTE",
  "ACRESCIMO_GANCHO",
  "REBASE",
  "CONTENCAO",
] as const;

/** Tipos que implicam outsourcing explícito no pedido. */
export const OUTSOURCING_WORK_TYPES: readonly WorkType[] = [
  "PROVA_ESQUELETO",
  "ESQUELETO_FLEXIVEL",
  "SOLDADURA",
  "ACRESCIMO_GANCHO_FUNDIDO",
] as const;

/** Tipos elegíveis para super urgência. */
export const SUPER_URGENCY_WORK_TYPES: readonly WorkType[] = [
  "REPARACAO",
  "ACRESCIMO_DENTE",
  "ACRESCIMO_GANCHO",
  "REBASE",
  "CONTENCAO",
] as const;

export const OUTSOURCING_DELIVERY_NOTE =
  "A data de entrega depende de outsourcing.";

export function isOutsourcingWorkType(workType: WorkType): boolean {
  return (OUTSOURCING_WORK_TYPES as readonly string[]).includes(workType);
}

/** Combina a lista fixa do negócio com a flag em `WorkTypeConfig`. */
export function orderRequiresOutsourcing(
  workType: WorkType,
  config: { requiresOutsourcing: boolean } | null
): boolean {
  return (
    config?.requiresOutsourcing === true || isOutsourcingWorkType(workType)
  );
}

export function isSuperUrgency(level: UrgencyLevel): boolean {
  return (
    level === "SUPER_URGENCIA_MANHA" || level === "SUPER_URGENCIA_TARDE"
  );
}

/**
 * Alinha com {@link calculateDeadline}: antes das 10:00 o dia de recolha é hoje;
 * caso contrário, o primeiro dia útil seguinte.
 */
export function computeCollectionDate(requestedAt: Date): Date {
  const dayStart = startOfDay(requestedAt);
  const minutesFromMidnight =
    requestedAt.getHours() * 60 + requestedAt.getMinutes();
  const onOrBefore10 = minutesFromMidnight <= 10 * 60;
  return onOrBefore10 ? dayStart : getNextWorkingDay(dayStart);
}

export function effectiveWorkingDaysForUrgency(
  urgencyLevel: UrgencyLevel,
  deadlineDays: number | null
): number {
  const base = deadlineDays ?? 0;
  switch (urgencyLevel) {
    case "NORMAL":
      return base;
    case "URGENTE":
      return Math.max(0, base - 1);
    case "SUPER_URGENCIA_MANHA":
    case "SUPER_URGENCIA_TARDE":
      return 0;
    default:
      return base;
  }
}

export function computeExpectedDeliveryAt(
  requestedAt: Date,
  urgencyLevel: UrgencyLevel,
  deadlineDays: number | null
): Date {
  const days = effectiveWorkingDaysForUrgency(urgencyLevel, deadlineDays);
  return calculateDeadline(requestedAt, days);
}

/** Anchor for deadline math when the driver is a calendar production day (local). */
export function deliveryAnchorFromProductionDate(productionDate: Date): Date {
  const a = startOfDay(productionDate);
  a.setHours(9, 0, 0, 0);
  return a;
}

export function computeExpectedDeliveryFromProductionDate(
  productionDate: Date,
  urgencyLevel: UrgencyLevel,
  deadlineDays: number | null
): Date {
  return computeExpectedDeliveryAt(
    deliveryAnchorFromProductionDate(productionDate),
    urgencyLevel,
    deadlineDays
  );
}

/** Limites do dia civil local do servidor (coerente com {@link calculateDeadline}). */
export function localDayRange(now: Date): { start: Date; end: Date } {
  const start = startOfDay(now);
  return { start, end: addDays(start, 1) };
}

export const orderFullInclude: Prisma.OrderInclude = {
  clinic: true,
  user: true,
  files: true,
  statusHistory: { orderBy: { changedAt: "desc" } },
};
