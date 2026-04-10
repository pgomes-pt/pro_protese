import { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getSupabaseServiceClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const BUCKET = "order-files";
const MAX_BYTES = 25 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/octet-stream",
  "model/stl",
  "application/sla",
  "application/vnd.ms-pki.stl",
]);

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

function extFromName(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function isAllowedFile(file: File): boolean {
  const ext = extFromName(file.name);
  if (ext === ".stl") return true;
  if (file.type.startsWith("image/")) return true;
  if (file.type && ALLOWED_MIME.has(file.type)) return true;
  return false;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest();
  if (!auth.ok) {
    return jsonError(auth.status, auth.message);
  }

  const { dbUser } = auth;
  if (dbUser.role !== UserRole.CLINICA || !dbUser.clinicId) {
    return jsonError(403, "Apenas utilizadores de clínica podem enviar ficheiros.");
  }

  const { id: orderId } = await ctx.params;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { clinicId: true },
  });
  if (!order) {
    return jsonError(404, "Pedido não encontrado.");
  }
  if (order.clinicId !== dbUser.clinicId) {
    return jsonError(403, "Não tem permissão para anexar ficheiros a este pedido.");
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return jsonError(
      503,
      "Envio de ficheiros indisponível (configuração do servidor em falta)."
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError(400, "Formulário inválido.");
  }

  const files = formData.getAll("files").filter((v): v is File => v instanceof File);
  if (files.length === 0) {
    return jsonError(400, "Nenhum ficheiro enviado.");
  }

  const created: { id: string; fileName: string; fileUrl: string; fileType: string | null }[] =
    [];

  for (const file of files) {
    if (!isAllowedFile(file)) {
      return jsonError(
        400,
        `Tipo de ficheiro não permitido: ${file.name}. Use imagens ou ficheiros .stl.`
      );
    }
    if (file.size > MAX_BYTES) {
      return jsonError(400, `Ficheiro demasiado grande: ${file.name} (máx. 25 MB).`);
    }

    const safeBase =
      file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "upload";
    const storagePath = `${orderId}/${crypto.randomUUID()}-${safeBase}`;

    const buf = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buf, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (upErr) {
      console.error(upErr);
      return jsonError(500, "Erro ao guardar ficheiro no armazenamento.");
    }

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    const fileUrl = pub.publicUrl;

    const row = await prisma.orderFile.create({
      data: {
        orderId,
        fileName: file.name,
        fileUrl,
        fileType: file.type || null,
      },
    });
    created.push({
      id: row.id,
      fileName: row.fileName,
      fileUrl: row.fileUrl,
      fileType: row.fileType,
    });
  }

  return NextResponse.json({ files: created }, { status: 201 });
}
