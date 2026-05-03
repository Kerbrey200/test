import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, "data.json");

function readData() {
  try {
    const data = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    return { users: [], materials: [], projects: [], requisitions: [], reports: [], waybills: [], invoices: [], inventory: [] };
  }
}

function writeData(data: any) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- Auth Routes ---
  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;
    const data = readData();
    const user = data.users.find((u: any) => u.email === email && u.password === password);
    
    if (user) {
      const { password, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } else {
      res.status(401).json({ message: "Email yoki parol noto'g'ri" });
    }
  });

  // --- Data Routes ---
  app.get("/api/data/:collection", (req, res) => {
    const { collection } = req.params;
    const data = readData();
    res.json(data[collection] || []);
  });

  app.post("/api/data/:collection", (req, res) => {
    const { collection } = req.params;
    const data = readData();
    if (!data[collection]) data[collection] = [];
    
    const newItem = { 
      id: Math.random().toString(36).substr(2, 9), 
      ...req.body,
      createdAt: new Date().toISOString()
    };
    
    data[collection].push(newItem);
    writeData(data);
    res.json(newItem);
  });

  app.put("/api/data/:collection/:id", (req, res) => {
    const { collection, id } = req.params;
    const data = readData();
    if (!data[collection]) return res.status(404).json({ message: "Topilmadi" });

    const index = data[collection].findIndex((item: any) => item.id === id || item.uid === id);
    if (index !== -1) {
      data[collection][index] = { ...data[collection][index], ...req.body, updatedAt: new Date().toISOString() };
      writeData(data);
      res.json(data[collection][index]);
    } else {
      res.status(404).json({ message: "Topilmadi" });
    }
  });

  app.delete("/api/data/:collection/:id", (req, res) => {
    const { collection, id } = req.params;
    const data = readData();
    if (!data[collection]) return res.status(404).json({ message: "Topilmadi" });

    data[collection] = data[collection].filter((item: any) => item.id !== id && item.uid !== id);
    writeData(data);
    res.json({ message: "O'chirildi" });
  });

  // --- Business Logic Routes ---
  app.post("/api/action/approveWaybill", (req, res) => {
    const { waybillId } = req.body;
    const data = readData();
    const waybill = data.waybills.find((w: any) => w.id === waybillId);
    
    if (!waybill || waybill.status === "APPROVED") {
      return res.status(400).json({ message: "Nakladminov topilmadi yoki allaqachon tasdiqlangan" });
    }

    // Process items
    waybill.items.forEach((item: any) => {
      // Deduct from sender
      const senderInv = data.inventory.find((inv: any) => inv.holderId === waybill.fromUid && inv.materialId === item.materialId);
      if (senderInv) {
        senderInv.balance -= item.quantity;
        senderInv.totalUsed = (senderInv.totalUsed || 0) + item.quantity;
        senderInv.lastUpdated = new Date().toISOString();
      }

      // Add to receiver
      let receiverInv = data.inventory.find((inv: any) => inv.holderId === waybill.toUid && inv.materialId === item.materialId);
      if (receiverInv) {
        receiverInv.balance += item.quantity;
        receiverInv.totalReceived = (receiverInv.totalReceived || 0) + item.quantity;
        receiverInv.lastUpdated = new Date().toISOString();
      } else {
        data.inventory.push({
          holderId: waybill.toUid,
          materialId: item.materialId,
          name: item.name,
          balance: item.quantity,
          totalReceived: item.quantity,
          totalUsed: 0,
          unit: item.unit,
          lastUpdated: new Date().toISOString()
        });
      }
    });

    waybill.status = "APPROVED";
    waybill.updatedAt = new Date().toISOString();
    writeData(data);
    res.json({ success: true });
  });

  app.post("/api/action/approveTechReport", (req, res) => {
    const { reportId } = req.body;
    const data = readData();
    const report = data.reports.find((r: any) => r.id === reportId);

    if (!report || report.status === "APPROVED") {
      return res.status(400).json({ message: "Hisobot topilmadi" });
    }

    report.items.forEach((item: any) => {
      const inv = data.inventory.find((inv: any) => inv.holderId === report.foremanUid && inv.materialId === item.materialId);
      if (inv) {
        inv.balance -= item.quantity;
        inv.totalUsed = (inv.totalUsed || 0) + item.quantity;
        inv.lastUpdated = new Date().toISOString();
      }
    });

    report.status = "APPROVED";
    report.updatedAt = new Date().toISOString();
    writeData(data);
    res.json({ success: true });
  });

  app.post("/api/action/addInvoice", (req, res) => {
    const invoiceData = req.body;
    const data = readData();
    
    const newInvoice = {
      id: Math.random().toString(36).substr(2, 9),
      ...invoiceData,
      createdAt: new Date().toISOString()
    };
    data.invoices.push(newInvoice);

    // Initial stock entry to supply officer inventory
    invoiceData.items.forEach((item: any) => {
      let inv = data.inventory.find((i: any) => i.holderId === invoiceData.supplyOfficerUid && i.materialId === item.materialId);
      if (inv) {
        inv.balance += item.quantity;
        inv.totalReceived = (inv.totalReceived || 0) + item.quantity;
        inv.lastUpdated = new Date().toISOString();
      } else {
        data.inventory.push({
          holderId: invoiceData.supplyOfficerUid,
          materialId: item.materialId,
          name: item.name,
          balance: item.quantity,
          totalReceived: item.quantity,
          totalUsed: 0,
          unit: item.unit,
          lastUpdated: new Date().toISOString()
        });
      }
    });

    writeData(data);
    res.json(newInvoice);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
