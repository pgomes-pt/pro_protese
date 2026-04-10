import * as fs from "fs";
import * as path from "path";
import {
  PrismaClient,
  UserRole,
  WorkType,
} from "@prisma/client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { addDays, startOfDay, subDays } from "date-fns";

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

const prisma = new PrismaClient();

/** Gregorian Easter Sunday (Anonymous algorithm). */
function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return startOfDay(new Date(year, month - 1, day));
}

function toHolidayDate(d: Date): Date {
  return startOfDay(d);
}

function buildPortugueseHolidays(
  year: number
): { date: Date; name: string }[] {
  const easter = getEasterSunday(year);
  const goodFriday = subDays(easter, 2);
  const carnival = subDays(easter, 47);
  const corpusChristi = addDays(easter, 60);

  return [
    { date: toHolidayDate(new Date(year, 0, 1)), name: "Ano Novo" },
    { date: toHolidayDate(carnival), name: "Carnaval" },
    { date: toHolidayDate(goodFriday), name: "Sexta-feira Santa" },
    { date: toHolidayDate(easter), name: "Páscoa" },
    { date: toHolidayDate(new Date(year, 3, 25)), name: "Dia da Liberdade" },
    { date: toHolidayDate(new Date(year, 4, 1)), name: "Dia do Trabalhador" },
    { date: toHolidayDate(corpusChristi), name: "Corpo de Deus" },
    {
      date: toHolidayDate(new Date(year, 5, 10)),
      name: "Dia de Portugal, de Camões e das Comunidades Portuguesas",
    },
    {
      date: toHolidayDate(new Date(year, 7, 15)),
      name: "Assunção de Nossa Senhora",
    },
    {
      date: toHolidayDate(new Date(year, 9, 5)),
      name: "Implantação da República",
    },
    { date: toHolidayDate(new Date(year, 10, 1)), name: "Dia de Todos-os-Santos" },
    {
      date: toHolidayDate(new Date(year, 11, 1)),
      name: "Restauração da Independência",
    },
    {
      date: toHolidayDate(new Date(year, 11, 8)),
      name: "Imaculada Conceição",
    },
    { date: toHolidayDate(new Date(year, 11, 25)), name: "Natal" },
  ];
}

const WORK_TYPE_CONFIGS: {
  workType: WorkType;
  deadlineDays: number | null;
  requiresOutsourcing: boolean;
  allowedForNew: boolean;
  requirements: string[];
}[] = [
  {
    workType: WorkType.REPARACAO,
    deadlineDays: 1,
    requiresOutsourcing: false,
    allowedForNew: true,
    requirements: ["Prótese", "Indicação clara da reparação"],
  },
  {
    workType: WorkType.ACRESCIMO_DENTE,
    deadlineDays: 1,
    requiresOutsourcing: false,
    allowedForNew: true,
    requirements: ["Prótese", "Dente ou cor indicada"],
  },
  {
    workType: WorkType.ACRESCIMO_GANCHO,
    deadlineDays: 1,
    requiresOutsourcing: false,
    allowedForNew: true,
    requirements: ["Prótese"],
  },
  {
    workType: WorkType.REBASE,
    deadlineDays: 1,
    requiresOutsourcing: false,
    allowedForNew: true,
    requirements: ["Prótese", "Moldeira ou modelo"],
  },
  {
    workType: WorkType.CONTENCAO,
    deadlineDays: 1,
    requiresOutsourcing: false,
    allowedForNew: true,
    requirements: ["Modelo em gesso"],
  },
  {
    workType: WorkType.CERA,
    deadlineDays: 3,
    requiresOutsourcing: false,
    allowedForNew: false,
    requirements: [
      "Modelo superior",
      "Modelo inferior",
      "Registo de mordida",
    ],
  },
  {
    workType: WorkType.MOLDEIRA,
    deadlineDays: 3,
    requiresOutsourcing: false,
    allowedForNew: false,
    requirements: ["Modelo em gesso"],
  },
  {
    workType: WorkType.PROVA,
    deadlineDays: 3,
    requiresOutsourcing: false,
    allowedForNew: false,
    requirements: [
      "Modelo superior",
      "Modelo inferior",
      "Registo de mordida",
      "Dentes selecionados",
    ],
  },
  {
    workType: WorkType.PROVA_ESQUELETO,
    deadlineDays: null,
    requiresOutsourcing: true,
    allowedForNew: false,
    requirements: ["Modelo em gesso", "Desenho do esqueleto"],
  },
  {
    workType: WorkType.ESQUELETO_FLEXIVEL,
    deadlineDays: null,
    requiresOutsourcing: true,
    allowedForNew: false,
    requirements: ["Modelo em gesso", "Cor selecionada"],
  },
  {
    workType: WorkType.TRABALHO_PRONTO,
    deadlineDays: 5,
    requiresOutsourcing: false,
    allowedForNew: false,
    requirements: ["Prova aprovada", "Registo de cor", "Modelo final"],
  },
  {
    workType: WorkType.ORTODONTIA,
    deadlineDays: 5,
    requiresOutsourcing: false,
    allowedForNew: false,
    requirements: ["Modelos em gesso", "Ficha do paciente"],
  },
  {
    workType: WorkType.SOLDADURA,
    deadlineDays: null,
    requiresOutsourcing: true,
    allowedForNew: false,
    requirements: ["Peça a soldar", "Indicação do trabalho"],
  },
  {
    workType: WorkType.ACRESCIMO_GANCHO_FUNDIDO,
    deadlineDays: null,
    requiresOutsourcing: true,
    allowedForNew: false,
    requirements: ["Prótese esquelética", "Modelo em gesso"],
  },
];

const WORK_PRICES: {
  category: string;
  itemKey: string;
  label: string;
  basePrice: number;
}[] = [
  {
    category: "DIVERSOS_ACRILICO",
    itemKey: "REPARACAO",
    label: "Reparação",
    basePrice: 24,
  },
  {
    category: "DIVERSOS_ACRILICO",
    itemKey: "MOLDEIRA_INDIVIDUAL",
    label: "Moldeira individual",
    basePrice: 12.5,
  },
  {
    category: "DIVERSOS_ACRILICO",
    itemKey: "CERA_ARTICULACAO",
    label: "Cera de articulação",
    basePrice: 9.5,
  },
  {
    category: "DIVERSOS_ACRILICO",
    itemKey: "FERULA_MIO",
    label: "Férula MIO",
    basePrice: 72,
  },
  {
    category: "DIVERSOS_ACRILICO",
    itemKey: "REBASE",
    label: "Rebase",
    basePrice: 45,
  },
  {
    category: "DIVERSOS_ACRILICO",
    itemKey: "GANCHO_INOX",
    label: "Gancho inox",
    basePrice: 11.5,
  },
  {
    category: "DIVERSOS_ACRILICO",
    itemKey: "GANCHO_BOLA",
    label: "Gancho bola",
    basePrice: 13.5,
  },
  {
    category: "DIVERSOS_ACRILICO",
    itemKey: "ACRESCIMO_DENTE",
    label: "Acréscimo de dente",
    basePrice: 27,
  },
  {
    category: "DIVERSOS_ACRILICO",
    itemKey: "DENTE_EXTRA",
    label: "Dente extra",
    basePrice: 15,
  },
  {
    category: "DIVERSOS_ACRILICO",
    itemKey: "ACRESCIMO_GANCHO",
    label: "Acréscimo de gancho",
    basePrice: 26,
  },
  {
    category: "DIVERSOS_ACRILICO",
    itemKey: "FERULA_BRANQUEAMENTO",
    label: "Férula de branqueamento",
    basePrice: 37,
  },
  {
    category: "DIVERSOS_CRCO",
    itemKey: "SOLDADURA",
    label: "Soldadura",
    basePrice: 36,
  },
  {
    category: "DIVERSOS_CRCO",
    itemKey: "AUMENTAR_SELA_DENTE",
    label: "Aumentar sela / dente",
    basePrice: 67,
  },
  {
    category: "DIVERSOS_CRCO",
    itemKey: "DENTE_EXTRA",
    label: "Dente extra",
    basePrice: 16,
  },
  {
    category: "DIVERSOS_CRCO",
    itemKey: "DENTE_FUNDIDO",
    label: "Dente fundido",
    basePrice: 30,
  },
  {
    category: "DIVERSOS_CRCO",
    itemKey: "GANCHO_FUNDIDO",
    label: "Gancho fundido",
    basePrice: 40,
  },
  {
    category: "DIVERSOS_CRCO",
    itemKey: "FACE_OCLUSIVA",
    label: "Face oclusiva",
    basePrice: 18,
  },
  {
    category: "DIVERSOS_CRCO",
    itemKey: "REDE_FUNDIDA",
    label: "Rede fundida",
    basePrice: 72,
  },
  {
    category: "DIVERSOS_CRCO",
    itemKey: "BARRA_LINGUAL",
    label: "Barra lingual",
    basePrice: 44,
  },
  {
    category: "ORTODONTIA",
    itemKey: "HIRAX",
    label: "Hirax",
    basePrice: 90,
  },
  {
    category: "ORTODONTIA",
    itemKey: "MACNAMARA",
    label: "McNamara",
    basePrice: 90,
  },
  {
    category: "ORTODONTIA",
    itemKey: "BOTAO_NANCE",
    label: "Botão de Nance",
    basePrice: 60,
  },
  {
    category: "ORTODONTIA",
    itemKey: "HASS",
    label: "Hass",
    basePrice: 90,
  },
  {
    category: "ORTODONTIA",
    itemKey: "BIHELIX",
    label: "Bihelix",
    basePrice: 54,
  },
  {
    category: "ORTODONTIA",
    itemKey: "QUADHELIX",
    label: "Quadhelix",
    basePrice: 66,
  },
  {
    category: "ORTODONTIA",
    itemKey: "DISJUNTOR_LEQUE",
    label: "Disjuntor em leque",
    basePrice: 102,
  },
  {
    category: "ORTODONTIA",
    itemKey: "MANTENEDOR_ESPACO",
    label: "Mantenedor de espaço",
    basePrice: 36,
  },
  {
    category: "ORTODONTIA",
    itemKey: "LIP_BUMPER",
    label: "Lip bumper",
    basePrice: 60,
  },
  {
    category: "ORTODONTIA",
    itemKey: "ARCO_LINGUAL",
    label: "Arco lingual",
    basePrice: 30,
  },
  {
    category: "ORTODONTIA",
    itemKey: "SHAWARTS",
    label: "Schwartz",
    basePrice: 78,
  },
  {
    category: "ORTODONTIA",
    itemKey: "HAWLEY",
    label: "Hawley",
    basePrice: 66,
  },
  {
    category: "ORTODONTIA",
    itemKey: "WRAPAROUND",
    label: "Wraparound",
    basePrice: 84,
  },
  {
    category: "ORTODONTIA",
    itemKey: "FERULA_CONTENCAO",
    label: "Férula de contenção",
    basePrice: 25,
  },
  {
    category: "ORTODONTIA",
    itemKey: "MODELOS_ESTUDO",
    label: "Modelos de estudo",
    basePrice: 48,
  },
  {
    category: "ORTODONTIA",
    itemKey: "MODELOS_ARCADA",
    label: "Modelos de arcada",
    basePrice: 12,
  },
  {
    category: "ORTODONTIA",
    itemKey: "SOLDADURA",
    label: "Soldadura",
    basePrice: 18,
  },
  {
    category: "ORTODONTIA",
    itemKey: "MOLA_ATIVACAO",
    label: "Mola de ativação",
    basePrice: 16,
  },
  {
    category: "ORTODONTIA",
    itemKey: "GANCHO_ADAMS",
    label: "Gancho de Adams",
    basePrice: 17,
  },
  {
    category: "ORTODONTIA",
    itemKey: "ARCO_VESTIBULAR",
    label: "Arco vestibular",
    basePrice: 30,
  },
  {
    category: "ORTODONTIA",
    itemKey: "GRELHA_LINGUAL",
    label: "Grelha lingual",
    basePrice: 36,
  },
];

async function seedHolidays() {
  for (const year of [2024, 2025, 2026]) {
    for (const { date, name } of buildPortugueseHolidays(year)) {
      await prisma.holiday.upsert({
        where: { date },
        create: { date, name },
        update: { name },
      });
    }
  }
}

async function seedWorkTypeConfigs() {
  for (const row of WORK_TYPE_CONFIGS) {
    await prisma.workTypeConfig.upsert({
      where: { workType: row.workType },
      create: {
        workType: row.workType,
        deadlineDays: row.deadlineDays,
        requiresOutsourcing: row.requiresOutsourcing,
        allowedForNew: row.allowedForNew,
        requirements: row.requirements,
      },
      update: {
        deadlineDays: row.deadlineDays,
        requiresOutsourcing: row.requiresOutsourcing,
        allowedForNew: row.allowedForNew,
        requirements: row.requirements,
      },
    });
  }
}

async function seedUrgencyConfig() {
  const existing = await prisma.urgencyConfig.findFirst({
    orderBy: { createdAt: "asc" },
  });
  const data = {
    maxDailyUrgent: 10,
    maxDailySuperUrgent: 5,
    surchargePercent: 60,
    surchargeMinValue: null as number | null,
  };
  if (existing) {
    await prisma.urgencyConfig.update({
      where: { id: existing.id },
      data,
    });
  } else {
    await prisma.urgencyConfig.create({ data });
  }
}

async function seedWorkPrices() {
  for (const row of WORK_PRICES) {
    await prisma.workPrice.upsert({
      where: {
        category_itemKey: {
          category: row.category,
          itemKey: row.itemKey,
        },
      },
      create: {
        category: row.category,
        itemKey: row.itemKey,
        label: row.label,
        basePrice: row.basePrice,
      },
      update: {
        label: row.label,
        basePrice: row.basePrice,
      },
    });
  }
}

async function findAuthUserByEmail(
  supabaseAdmin: SupabaseClient,
  email: string
) {
  const perPage = 1000;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;
    const users = data?.users ?? [];
    const found = users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );
    if (found) return found;
    if (users.length < perPage) break;
  }
  return undefined;
}

async function seedAdminUser() {
  const emailRaw = process.env.SEED_ADMIN_EMAIL?.trim();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!emailRaw || !password) {
    console.log(
      "Seed admin: ignorado (defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD)."
    );
    return;
  }

  const email = emailRaw.toLowerCase();

  if (!url || !serviceKey) {
    console.log(
      "Seed admin: ignorado (NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em falta)."
    );
    return;
  }

  const supabaseAdmin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const existingPrisma = await prisma.user.findUnique({
    where: { email },
  });

  if (existingPrisma?.role === UserRole.ADMIN) {
    console.log(
      `Seed admin: utilizador admin já existe em Prisma (${email}). Ignorado.`
    );
    return;
  }

  const existingAuth = await findAuthUserByEmail(supabaseAdmin, email);
  if (existingAuth) {
    if (!existingPrisma) {
      await prisma.user.create({
        data: {
          id: existingAuth.id,
          email,
          name: "Administrador",
          role: UserRole.ADMIN,
          clinicId: null,
        },
      });
      console.log(
        `Seed admin: registo Prisma criado para utilizador Supabase existente (${email}).`
      );
    } else {
      console.log(
        `Seed admin: email já existe no Supabase com outro perfil em Prisma (${email}). Revise manualmente.`
      );
    }
    return;
  }

  const { data: created, error: createError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: "ADMIN",
        name: "Administrador",
      },
    });

  if (createError || !created.user) {
    const msg = createError?.message ?? "";
    if (
      msg.toLowerCase().includes("already") ||
      msg.toLowerCase().includes("registered")
    ) {
      const u = await findAuthUserByEmail(supabaseAdmin, email);
      if (u && !existingPrisma) {
        await prisma.user.create({
          data: {
            id: u.id,
            email,
            name: "Administrador",
            role: UserRole.ADMIN,
            clinicId: null,
          },
        });
        console.log(
          `Seed admin: registo Prisma criado após conflito Supabase (${email}).`
        );
      } else {
        console.log(`Seed admin: utilizador já existente (${email}). Ignorado.`);
      }
      return;
    }
    throw new Error(msg || "Supabase admin.createUser failed");
  }

  const authId = created.user.id;

  try {
    await prisma.user.create({
      data: {
        id: authId,
        email,
        name: "Administrador",
        role: UserRole.ADMIN,
        clinicId: null,
      },
    });
    console.log(`Seed admin: criado com sucesso (${email}, id=${authId}).`);
  } catch (e) {
    await supabaseAdmin.auth.admin.deleteUser(authId);
    throw e;
  }
}

async function main() {
  try {
    console.log("Seeding holidays…");
    await seedHolidays();
    console.log("Seeding WorkTypeConfig…");
    await seedWorkTypeConfigs();
    console.log("Seeding UrgencyConfig…");
    await seedUrgencyConfig();
    console.log("Seeding WorkPrice…");
    await seedWorkPrices();
    console.log("Seeding admin user…");
    await seedAdminUser();
    console.log("Seed completed.");
  } catch (e) {
    console.error(e);
    throw e;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  process.exit(1);
});
