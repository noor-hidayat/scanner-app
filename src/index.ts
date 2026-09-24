import cors from "cors";
import ExcelJS from "exceljs";
import express from "express";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import fs from "node:fs";
import path from "node:path";
import { Server } from "socket.io";
import { clearScans, getCountByScanner, getRecentScans, getScans, getTotalCount, insertScan } from "./db";
import { clearDebounce, getDebounceMs, shouldAccept } from "./scans";

const PORT = Number(process.env.PORT ?? 3000);
const HTTPS_PORT = Number(process.env.HTTPS_PORT ?? 3443);
const HOST = process.env.HOST ?? "0.0.0.0";

const app = express();
app.use(cors());
app.use(express.json());

// ---- Scanner registry (in-memory) ----
interface ScannerInfo {
  scannerId: string;
  connected: boolean;
  lastActivity: string;
  lastScan?: string;
  socketId?: string;
}
const scanners = new Map<string, ScannerInfo>();

function touchScanner(scannerId: string, socketId?: string, lastScan?: string) {
  const now = new Date().toISOString();
  const prev = scanners.get(scannerId);
  scanners.set(scannerId, {
    scannerId,
    connected: true,
    lastActivity: now,
    lastScan: lastScan ?? prev?.lastScan,
    socketId: socketId ?? prev?.socketId,
  });
}

function broadcastStatus(targetIo?: Server) {
  const counts = getCountByScanner();
  const list = [...scanners.values()].map((s) => ({
    ...s,
    totalScan: counts[s.scannerId] ?? 0,
  }));
  const payload = {
    scanners: list,
    totalScans: getTotalCount(),
    debounceMs: getDebounceMs(),
  };
  if (targetIo) { targetIo.emit("server:status", payload); return; }
  try { io.emit("server:status", payload); } catch {}
  try { ioHttps?.emit("server:status", payload); } catch {}
}
function emitScan(payload: unknown) {
  try { io.emit("server:scan", payload); } catch {}
  try { ioHttps?.emit("server:scan", payload); } catch {}
}

// ---- Static UI ----
const PUBLIC_DIR = path.join(process.cwd(), "public");
app.use(express.static(PUBLIC_DIR));
app.get("/scanner", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "scanner.html")));

// ---- REST API ----
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", serverTime: new Date().toISOString(), totalScans: getTotalCount() });
});

function handleScan(barcodeRaw: unknown, scannerIdRaw: unknown) {
  const barcode = String(barcodeRaw ?? "").trim();
  const scannerId = String(scannerIdRaw ?? "").trim() || "UNKNOWN";
  if (!barcode) {
    return { ok: false as const, error: "Invalid barcode" };
  }
  if (barcode.length > 128) {
    return { ok: false as const, error: "Invalid barcode" };
  }
  const accepted = shouldAccept(scannerId, barcode);
  const status = accepted ? "Accepted" : "Ignored";
  const scan = insertScan(barcode, scannerId, status);
  touchScanner(scannerId, undefined, barcode);
  return { ok: true as const, scan, status };
}

app.post("/api/scan", (req, res) => {
  const result = handleScan(req.body?.barcode, req.body?.scannerId);
  if (!result.ok) {
    insertScan(String(req.body?.barcode ?? ""), String(req.body?.scannerId ?? "UNKNOWN"), "Error");
    res.status(400).json({ ok: false, error: result.error });
    return;
  }
  emitScan({ ok: true, scan: result.scan, status: result.status });
  broadcastStatus();
  res.status(result.status === "Accepted" ? 201 : 200).json({
    ok: true,
    status: result.status,
    scan: result.scan,
    message: result.status === "Accepted" ? "Scan successful" : "Already scanned",
  });
});

app.get("/api/scans", (req, res) => {
  const scanner = typeof req.query.scanner === "string" ? req.query.scanner : undefined;
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 100;
  res.json({ scans: getScans({ scanner, q, limit }), total: getTotalCount() });
});

app.delete("/api/scans", (_req, res) => {
  const r = clearScans();
  clearDebounce();
  scanners.clear();
  emitScan({ ok: true, cleared: true, deleted: r.deleted });
  broadcastStatus();
  res.json({ ok: true, deleted: r.deleted });
});

app.get("/api/scanners", (_req, res) => {
  const counts = getCountByScanner();
  const list = [...scanners.values()].map((s) => ({ ...s, totalScan: counts[s.scannerId] ?? 0 }));
  res.json({ scanners: list, totalScans: getTotalCount(), debounceMs: getDebounceMs() });
});

app.get("/api/scans/export", async (_req, res) => {
  const rows = [...getRecentScans(10000)].reverse(); // chronological
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Scans");
  ws.columns = [
    { header: "No", key: "no", width: 6 },
    { header: "Barcode", key: "barcode", width: 24 },
    { header: "Scanner ID", key: "scannerId", width: 14 },
    { header: "Scan Time", key: "scanTime", width: 22 },
    { header: "Status", key: "status", width: 12 },
  ];
  rows.forEach((r, i) => {
    ws.addRow({
      no: i + 1,
      barcode: r.barcode,
      scannerId: r.scanner_id,
      scanTime: r.scanned_at,
      status: r.status,
    });
  });
  ws.getRow(1).font = { bold: true };
  const date = new Date().toISOString().slice(0, 10);
  const filename = `barcode-scan-${date}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
});

// ---- HTTPS cert (self-signed) untuk camera getUserMedia di LAN ----
async function getOrCreateCert(): Promise<{ key: string; cert: string } | null> {
  try {
    const certDir = path.join(process.cwd(), "certs");
    const keyPath = path.join(certDir, "key.pem");
    const certPath = path.join(certDir, "cert.pem");
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      return { key: fs.readFileSync(keyPath, "utf8"), cert: fs.readFileSync(certPath, "utf8") };
    }
    // generate self-signed via selfsigned v5 (async)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const selfsigned = require("selfsigned") as { generate: (attrs: unknown, opts: unknown) => Promise<{ private: string; cert: string; public: string }> };
    const attrs = [{ name: "commonName", value: "scanner-app" }];
    const opts: Record<string, unknown> = { keySize: 2048, days: 365, algorithm: "sha256" };
    const pems: { private: string; cert: string } = await selfsigned.generate(attrs as never, opts as never) as unknown as { private: string; cert: string };
    fs.mkdirSync(certDir, { recursive: true });
    fs.writeFileSync(keyPath, pems.private);
    fs.writeFileSync(certPath, pems.cert);
    console.log(`Self-signed cert dibuat: ${certPath}`);
    return { key: pems.private, cert: pems.cert };
  } catch (e) {
    console.warn("Gagal buat cert self-signed, HTTPS dinonaktifkan:", (e as Error).message);
    return null;
  }
}

// ---- WebSocket & server bootstrap (async karena cert) ----
const httpServer = createHttpServer(app);
let httpsServer: ReturnType<typeof createHttpsServer> | null = null;
let io: Server;
let ioHttps: Server | null = null;

async function bootstrap() {
  const httpsCreds = await getOrCreateCert();
  if (httpsCreds) {
    try {
      httpsServer = createHttpsServer(httpsCreds, app);
      ioHttps = new Server(httpsServer, { cors: { origin: "*" } });
    } catch (e) {
      console.warn("Gagal buat HTTPS server:", (e as Error).message);
    }
  }
  io = new Server(httpServer, { cors: { origin: "*" } });
  if (ioHttps) attachSocketHandlers(ioHttps);
  attachSocketHandlers(io);

  httpServer.listen(PORT, HOST, () => {
    const nets = getLanUrls(PORT);
    console.log(`Wireless Barcode Scanner server running at http://${HOST}:${PORT}`);
    console.log(`Dashboard: buka salah satu URL di bawah dari browser PC/HP:`);
    for (const u of nets) console.log(`  - ${u}`);
    console.log(`Halaman scanner HP: <server-url>/scanner`);
    if (httpsServer) {
      const netsHttps = getLanUrls(HTTPS_PORT).map((u) => u.replace("http://", "https://"));
      console.log(`HTTPS (untuk kamera HP): https://${HOST}:${HTTPS_PORT}`);
      for (const u of netsHttps) console.log(`  - ${u}`);
      console.log(`Scanner HTTPS: https://<IP-PC>:${HTTPS_PORT}/scanner  (terima self-signed di HP)`);
    } else {
      console.log(`HTTPS tidak aktif. Untuk kamera via HTTP, aktifkan di Chrome: chrome://flags/#unsafely-treat-insecure-origin-as-secure → tambah http://<IP-PC>:${PORT}`);
    }
  });
  if (httpsServer) {
    httpsServer.listen(HTTPS_PORT, HOST, () => {
      console.log(`HTTPS server listening at https://${HOST}:${HTTPS_PORT}`);
    });
  }
}

function attachSocketHandlers(sio: Server) {
  sio.on("connection", (socket) => {
    const scannerId = String(socket.handshake.auth?.scannerId ?? socket.handshake.query?.scannerId ?? "").trim();

    if (scannerId) {
      touchScanner(scannerId, socket.id);
      socket.join(`scanner:${scannerId}`);
      socket.emit("scanner:connect", { ok: true, scannerId });
      broadcastStatus();
    }

    socket.on("scanner:connect", (payload: { scannerId?: string }) => {
      const id = String(payload?.scannerId ?? "").trim();
      if (!id) return;
      (socket.data as { scannerId?: string }).scannerId = id;
      touchScanner(id, socket.id);
      socket.join(`scanner:${id}`);
      socket.emit("scanner:connect", { ok: true, scannerId: id });
      broadcastStatus();
    });

    socket.on("scanner:scan", (payload: { barcode?: string; scannerId?: string }) => {
      const id =
        String(payload?.scannerId ?? (socket.data as { scannerId?: string }).scannerId ?? scannerId ?? "").trim() ||
        "UNKNOWN";
      const result = handleScan(payload?.barcode, id);
      if (!result.ok) {
        socket.emit("server:scan", { ok: false, error: result.error });
        return;
      }
      socket.emit("server:scan", { ok: true, scan: result.scan, status: result.status });
      socket.broadcast.emit("server:scan", { ok: true, scan: result.scan, status: result.status });
      emitScan({ ok: true, scan: result.scan, status: result.status });
      broadcastStatus();
    });

    socket.on("disconnect", () => {
      const id =
        String((socket.data as { scannerId?: string }).scannerId ?? scannerId ?? "").trim();
      if (id && scanners.has(id)) {
        const prev = scanners.get(id)!;
        if (!prev.socketId || prev.socketId === socket.id) {
          scanners.set(id, { ...prev, connected: false, lastActivity: new Date().toISOString() });
          broadcastStatus();
        }
      }
    });
  });
}

bootstrap();

function getLanUrls(port: number): string[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const os = require("node:os") as typeof import("node:os");
    const out: string[] = [];
    for (const ifs of Object.values(os.networkInterfaces())) {
      for (const ni of ifs ?? []) {
        if (ni.family === "IPv4" && !ni.internal) out.push(`http://${ni.address}:${port}`);
      }
    }
    out.push(`http://localhost:${port}`);
    return out;
  } catch {
    return [`http://localhost:${port}`];
  }
}

export { app, io };
