-- CreateEnum
CREATE TYPE "ClinicStatus" AS ENUM ('NOVA', 'ATIVA');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CLINICA', 'ADMIN', 'ESTAFETA');

-- CreateEnum
CREATE TYPE "WorkType" AS ENUM ('REPARACAO', 'ACRESCIMO_DENTE', 'ACRESCIMO_GANCHO', 'REBASE', 'CONTENCAO', 'CERA', 'MOLDEIRA', 'PROVA', 'PROVA_ESQUELETO', 'ESQUELETO_FLEXIVEL', 'TRABALHO_PRONTO', 'ORTODONTIA', 'SOLDADURA', 'ACRESCIMO_GANCHO_FUNDIDO');

-- CreateEnum
CREATE TYPE "UrgencyLevel" AS ENUM ('NORMAL', 'URGENTE', 'SUPER_URGENCIA_MANHA', 'SUPER_URGENCIA_TARDE');

-- CreateEnum
CREATE TYPE "WorkStatus" AS ENUM ('PEDIDO_FEITO', 'RECOLHIDO', 'EM_PRODUCAO', 'CONCLUIDO', 'ENTREGUE', 'DEVOLVIDO', 'EM_ESPERA');

-- CreateTable
CREATE TABLE "Clinic" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "nif" TEXT,
    "status" "ClinicStatus" NOT NULL DEFAULT 'NOVA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clinic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'CLINICA',
    "clinicId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workType" "WorkType" NOT NULL,
    "urgencyLevel" "UrgencyLevel" NOT NULL DEFAULT 'NORMAL',
    "status" "WorkStatus" NOT NULL DEFAULT 'PEDIDO_FEITO',
    "patientName" TEXT,
    "patientAge" INTEGER,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "collectionDate" TIMESTAMP(3),
    "minDeliveryDate" TIMESTAMP(3),
    "expectedDeliveryAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "returnReason" TEXT,
    "notes" TEXT,
    "requirementsMet" BOOLEAN NOT NULL DEFAULT false,
    "requirementsWarning" BOOLEAN NOT NULL DEFAULT false,
    "urgencyApproved" BOOLEAN,
    "urgencyApprovedAt" TIMESTAMP(3),
    "urgencyApprovedBy" TEXT,
    "priceBase" DOUBLE PRECISION,
    "priceUrgencySurcharge" DOUBLE PRECISION,
    "priceTotal" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderFile" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusHistory" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "WorkStatus" NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedBy" TEXT,
    "notes" TEXT,

    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkTypeConfig" (
    "id" TEXT NOT NULL,
    "workType" "WorkType" NOT NULL,
    "deadlineDays" INTEGER,
    "requiresOutsourcing" BOOLEAN NOT NULL DEFAULT false,
    "requirements" TEXT[],
    "allowedForNew" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WorkTypeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UrgencyConfig" (
    "id" TEXT NOT NULL,
    "maxDailyUrgent" INTEGER NOT NULL DEFAULT 10,
    "maxDailySuperUrgent" INTEGER NOT NULL DEFAULT 5,
    "surchargePercent" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "surchargeMinValue" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UrgencyConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_email_key" ON "Clinic"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_nif_key" ON "Clinic"("nif");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "WorkTypeConfig_workType_key" ON "WorkTypeConfig"("workType");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_key" ON "Holiday"("date");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFile" ADD CONSTRAINT "OrderFile_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
