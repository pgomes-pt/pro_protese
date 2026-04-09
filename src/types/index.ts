import { WorkType, UrgencyLevel, WorkStatus, ClinicStatus, UserRole } from "@prisma/client";

export type { WorkType, UrgencyLevel, WorkStatus, ClinicStatus, UserRole };

export const WORK_TYPE_LABELS: Record<WorkType, string> = {
  REPARACAO: "Reparação",
  ACRESCIMO_DENTE: "Acréscimo de Dente",
  ACRESCIMO_GANCHO: "Acréscimo de Gancho",
  REBASE: "Rebase",
  CONTENCAO: "Contenção",
  CERA: "Cera",
  MOLDEIRA: "Moldeira",
  PROVA: "Prova",
  PROVA_ESQUELETO: "Prova de Esqueleto",
  ESQUELETO_FLEXIVEL: "Esqueleto Flexível",
  TRABALHO_PRONTO: "Trabalho Pronto",
  ORTODONTIA: "Ortodontia",
  SOLDADURA: "Soldadura",
  ACRESCIMO_GANCHO_FUNDIDO: "Acréscimo de Gancho Fundido",
};

export const URGENCY_LABELS: Record<UrgencyLevel, string> = {
  NORMAL: "Normal",
  URGENTE: "Urgente",
  SUPER_URGENCIA_MANHA: "Super Urgência – Manhã",
  SUPER_URGENCIA_TARDE: "Super Urgência – Tarde",
};

export const STATUS_LABELS: Record<WorkStatus, string> = {
  PEDIDO_FEITO: "Pedido Feito",
  RECOLHIDO: "Recolhido",
  EM_PRODUCAO: "Em Produção",
  CONCLUIDO: "Concluído",
  ENTREGUE: "Entregue",
  DEVOLVIDO: "Devolvido",
  EM_ESPERA: "Em Espera",
};

// Tipos de trabalho disponíveis para clínicas novas
export const WORK_TYPES_NEW_CLINIC: WorkType[] = [
  "REPARACAO",
  "ACRESCIMO_DENTE",
  "ACRESCIMO_GANCHO",
  "REBASE",
  "CONTENCAO",
];

// Tipos que dependem de outsourcing (sem prazo fixo)
export const WORK_TYPES_OUTSOURCING: WorkType[] = [
  "PROVA_ESQUELETO",
  "ESQUELETO_FLEXIVEL",
  "SOLDADURA",
  "ACRESCIMO_GANCHO_FUNDIDO",
];