import "dotenv/config";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IS_PRODUCTION = process.env.NODE_ENV === "production" || process.argv.includes("--production");
const PORT = Number(process.env.PORT) || 3000;

// The repo's data.json is only the initial seed; DATA_FILE lets live data sit outside the repo so `git pull` never clashes with it.
const SEED_FILE = path.join(__dirname, "data.json");
const DATA_FILE = process.env.DATA_FILE ? path.resolve(process.env.DATA_FILE) : SEED_FILE;
if (!fs.existsSync(DATA_FILE)) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.copyFileSync(SEED_FILE, DATA_FILE);
}

const COLLECTIONS = ["users", "materials", "projects", "requisitions", "reports", "waybills", "invoices", "inventory"];

function newId() {
  return Math.random().toString(36).slice(2, 11);
}

function readData() {
  let data: any;
  try {
    data = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch (err) {
    data = {};
  }
  for (const c of COLLECTIONS) if (!Array.isArray(data[c])) data[c] = [];

  // Older inventory rows were created without an id, which makes them impossible to update by id.
  let patched = false;
  for (const row of data.inventory) {
    if (!row.id) { row.id = newId(); patched = true; }
  }
  if (patched) writeData(data);
  return data;
}

function writeData(data: any) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function userId(u: any) {
  return u.uid || u.id;
}

function findUser(data: any, id: string) {
  return data.users.find((u: any) => userId(u) === id);
}

function stripPassword(user: any) {
  const { password, ...rest } = user;
  return rest;
}

class BusinessError extends Error {}

type StockItem = { materialId: string; name?: string; quantity: number; unit?: string };

function validateItems(items: any): StockItem[] {
  if (!Array.isArray(items) || items.length === 0) throw new BusinessError("Materiallar ro'yxati bo'sh");
  for (const item of items) {
    if (!item.materialId) throw new BusinessError(`"${item.name || "?"}" materiali tizimdagi materialga bog'lanmagan`);
    const qty = Number(item.quantity);
    if (!Number.isFinite(qty) || qty <= 0) throw new BusinessError(`"${item.name || item.materialId}" miqdori noto'g'ri`);
    item.quantity = qty;
  }
  return items;
}

function findInventory(data: any, holderId: string, materialId: string) {
  return data.inventory.find((i: any) => i.holderId === holderId && i.materialId === materialId);
}

// Checks every item before touching anything so a partially-applied movement can never happen.
function assertStock(data: any, holderId: string, items: StockItem[]) {
  const needed = new Map<string, { qty: number; name: string; unit: string }>();
  for (const item of items) {
    const prev = needed.get(item.materialId);
    needed.set(item.materialId, {
      qty: (prev?.qty || 0) + item.quantity,
      name: item.name || item.materialId,
      unit: item.unit || "",
    });
  }
  const shortages: string[] = [];
  for (const [materialId, n] of needed) {
    const balance = findInventory(data, holderId, materialId)?.balance || 0;
    if (balance < n.qty) shortages.push(`${n.name}: kerak ${n.qty} ${n.unit}, mavjud ${balance} ${n.unit}`);
  }
  if (shortages.length) throw new BusinessError("Qoldiq yetarli emas — " + shortages.join("; "));
}

function debitInventory(data: any, holderId: string, item: StockItem) {
  const inv = findInventory(data, holderId, item.materialId);
  inv.balance -= item.quantity;
  inv.totalUsed = (inv.totalUsed || 0) + item.quantity;
  inv.lastUpdated = new Date().toISOString();
}

function creditInventory(data: any, holderId: string, item: StockItem) {
  const inv = findInventory(data, holderId, item.materialId);
  if (inv) {
    inv.balance += item.quantity;
    inv.totalReceived = (inv.totalReceived || 0) + item.quantity;
    inv.lastUpdated = new Date().toISOString();
    return;
  }
  const material = data.materials.find((m: any) => m.id === item.materialId);
  data.inventory.push({
    id: newId(),
    holderId,
    materialId: item.materialId,
    name: material?.name || item.name,
    balance: item.quantity,
    totalReceived: item.quantity,
    totalUsed: 0,
    unit: material?.unit || item.unit,
    lastUpdated: new Date().toISOString(),
  });
}

function requireActor(data: any, actorId: string) {
  const actor = actorId && findUser(data, actorId);
  if (!actor) throw new BusinessError("Foydalanuvchi topilmadi");
  return actor;
}

const REQUISITION_FLOW: Record<string, { roles: string[]; next: string }> = {
  PENDING_CHIEF: { roles: ["CHIEF_ENGINEER", "ADMIN"], next: "PENDING_PTO" },
  PENDING_PTO: { roles: ["PTO", "ADMIN"], next: "PENDING_MGMT" },
  PENDING_MGMT: { roles: ["MANAGEMENT", "ADMIN"], next: "APPROVED" },
};

const REPORT_FLOW: Record<string, string[]> = {
  PENDING_PTO: ["PTO", "ADMIN"],
  PENDING_CHIEF: ["CHIEF_ENGINEER", "ADMIN"],
};

function action(handler: (req: express.Request, data: any) => any) {
  return (req: express.Request, res: express.Response) => {
    try {
      const data = readData();
      const result = handler(req, data);
      writeData(data);
      res.json(result ?? { success: true });
    } catch (err: any) {
      if (err instanceof BusinessError) return res.status(400).json({ message: err.message });
      console.error(err);
      res.status(500).json({ message: "Serverda xatolik" });
    }
  };
}

function assertUniqueEmail(data: any, email: string, exceptId?: string) {
  if (!email) return;
  const normalized = String(email).trim().toLowerCase();
  const clash = data.users.find((u: any) => String(u.email).trim().toLowerCase() === normalized && userId(u) !== exceptId);
  if (clash) throw new BusinessError("Bu email bilan foydalanuvchi allaqachon mavjud");
}

async function startServer() {
  const app = express();

  app.use(express.json());

  // --- Auth Routes ---
  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;
    const data = readData();
    const normalized = String(email || "").trim().toLowerCase();
    const user = data.users.find((u: any) => String(u.email).trim().toLowerCase() === normalized && u.password === password);

    if (user) {
      res.json({ user: stripPassword(user) });
    } else {
      res.status(401).json({ message: "Email yoki parol noto'g'ri" });
    }
  });

  app.get("/api/auth/me/:id", (req, res) => {
    const user = findUser(readData(), req.params.id);
    if (!user) return res.status(404).json({ message: "Foydalanuvchi topilmadi" });
    res.json({ user: stripPassword(user) });
  });

  // --- Data Routes ---
  app.get("/api/data/:collection", (req, res) => {
    const { collection } = req.params;
    const data = readData();
    res.json(data[collection] || []);
  });

  app.post("/api/data/:collection", action((req, data) => {
    const { collection } = req.params;
    if (!data[collection]) data[collection] = [];
    if (collection === "users") assertUniqueEmail(data, req.body.email);

    const newItem = {
      ...req.body,
      id: newId(),
      createdAt: new Date().toISOString(),
    };
    data[collection].push(newItem);
    return newItem;
  }));

  app.put("/api/data/:collection/:id", action((req, data) => {
    const { collection, id } = req.params;
    const list = data[collection];
    const index = list ? list.findIndex((item: any) => item.id === id || item.uid === id) : -1;
    if (index === -1) throw new BusinessError("Topilmadi");
    if (collection === "users") assertUniqueEmail(data, req.body.email, id);

    const { id: _ignoredId, uid: _ignoredUid, ...changes } = req.body;
    list[index] = { ...list[index], ...changes, updatedAt: new Date().toISOString() };
    return list[index];
  }));

  app.delete("/api/data/:collection/:id", action((req, data) => {
    const { collection, id } = req.params;
    if (!data[collection]) throw new BusinessError("Topilmadi");

    if (collection === "materials") {
      const inUse = data.inventory.some((i: any) => i.materialId === id && i.balance !== 0);
      if (inUse) throw new BusinessError("Bu material omborda qoldiqqa ega — o'chirib bo'lmaydi");
    }
    if (collection === "waybills") {
      const waybill = data.waybills.find((w: any) => w.id === id);
      if (waybill && waybill.status !== "PENDING") throw new BusinessError("Qabul qilingan nakladnoyni o'chirib bo'lmaydi");
    }

    data[collection] = data[collection].filter((item: any) => item.id !== id && item.uid !== id);
    return { message: "O'chirildi" };
  }));

  // --- Business Logic Routes ---
  app.post("/api/action/approveWaybill", action((req, data) => {
    const { waybillId, actorId } = req.body;
    const waybill = data.waybills.find((w: any) => w.id === waybillId);
    if (!waybill) throw new BusinessError("Nakladnoy topilmadi");
    if (waybill.status !== "PENDING") throw new BusinessError("Nakladnoy allaqachon qabul qilingan");
    if (actorId !== waybill.toUid) throw new BusinessError("Nakladnoyni faqat qabul qiluvchi tasdiqlaydi");

    const items = validateItems(waybill.items);
    assertStock(data, waybill.fromUid, items);
    for (const item of items) {
      debitInventory(data, waybill.fromUid, item);
      creditInventory(data, waybill.toUid, item);
    }

    waybill.status = "APPROVED";
    waybill.approvedAt = new Date().toISOString();
    waybill.updatedAt = waybill.approvedAt;
    return { success: true };
  }));

  app.post("/api/action/approveReport", action((req, data) => {
    const { reportId, actorId } = req.body;
    const actor = requireActor(data, actorId);
    const report = data.reports.find((r: any) => r.id === reportId);
    if (!report) throw new BusinessError("Hisobot topilmadi");

    const allowed = REPORT_FLOW[report.status];
    if (!allowed) throw new BusinessError("Hisobot allaqachon yakunlangan");
    if (!allowed.includes(actor.role)) throw new BusinessError("Bu bosqichda tasdiqlash huquqingiz yo'q");

    const now = new Date().toISOString();
    if (report.status === "PENDING_PTO") {
      report.ptoApproved = true;
      report.status = "PENDING_CHIEF";
    } else {
      const items = validateItems(report.items);
      assertStock(data, report.foremanUid, items);
      for (const item of items) debitInventory(data, report.foremanUid, item);
      report.chiefApproved = true;
      report.status = "APPROVED";
    }
    report.history = [...(report.history || []), { status: report.status, timestamp: now, userUid: actorId }];
    report.updatedAt = now;
    return report;
  }));

  app.post("/api/action/decideRequisition", action((req, data) => {
    const { requisitionId, actorId, decision, comment } = req.body;
    const actor = requireActor(data, actorId);
    const requisition = data.requisitions.find((r: any) => r.id === requisitionId);
    if (!requisition) throw new BusinessError("Zayavka topilmadi");

    const step = REQUISITION_FLOW[requisition.status];
    if (!step) throw new BusinessError("Zayavka allaqachon yakunlangan");
    if (!step.roles.includes(actor.role)) throw new BusinessError("Bu bosqichda qaror qabul qilish huquqingiz yo'q");
    if (decision !== "approve" && decision !== "reject") throw new BusinessError("Noma'lum qaror");

    const now = new Date().toISOString();
    requisition.status = decision === "approve" ? step.next : "REJECTED";
    requisition.history = [...(requisition.history || []), {
      status: requisition.status,
      timestamp: now,
      userUid: actorId,
      comment: comment || (decision === "approve" ? "Tasdiqlandi" : "Rad etildi"),
    }];
    requisition.updatedAt = now;
    return requisition;
  }));

  app.post("/api/action/addInvoice", action((req, data) => {
    const { items, ...invoiceData } = req.body;
    const holder = invoiceData.supplyOfficerUid && findUser(data, invoiceData.supplyOfficerUid);
    if (!holder) throw new BusinessError("Mas'ul xodim tanlanmagan");
    const validItems = validateItems(items);

    const newInvoice = {
      ...invoiceData,
      items: validItems,
      id: newId(),
      createdAt: new Date().toISOString(),
    };
    data.invoices.push(newInvoice);
    for (const item of validItems) creditInventory(data, invoiceData.supplyOfficerUid, item);
    return newInvoice;
  }));

  app.post("/api/action/addStock", action((req, data) => {
    const { holderId, items } = req.body;
    if (!holderId || !findUser(data, holderId)) throw new BusinessError("Mas'ul xodim tanlanmagan");
    const validItems = validateItems(items);
    for (const item of validItems) creditInventory(data, holderId, item);
    return { success: true, count: validItems.length };
  }));

  app.all("/api/*", (req, res) => {
    res.status(404).json({ message: "API topilmadi" });
  });

  if (IS_PRODUCTION) {
    const distPath = path.join(__dirname, "dist");
    if (!fs.existsSync(path.join(distPath, "index.html"))) {
      console.error("dist/ topilmadi — avval `npm run build` bajaring.");
      process.exit(1);
    }
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT} (${IS_PRODUCTION ? "production" : "development"}), data: ${DATA_FILE}`);
  });
}

startServer();
