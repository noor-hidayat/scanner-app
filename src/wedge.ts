/**
 * Keyboard Wedge — mengetik hasil scan ke aplikasi yang sedang fokus
 * (Excel, aplikasi stock opname, dsb) seolah diketik scanner USB.
 *
 * Cara pakai (di PC/laptop yang membuka aplikasi target):
 *   1. Klik field/cell yang menerima scan di aplikasi target.
 *   2. npx tsx src/wedge.ts   (atau: npm run wedge)
 *   3. Scan dari HP seperti biasa → kode terketik + Enter otomatis.
 *
 * Env:
 *   SERVER_URL     default http://localhost:3000
 *   WEDGE_SCANNER  opsional, hanya ketik scan dari Scanner ID ini (mis. HP-01)
 *   WEDGE_SUFFIX   enter | tab | none   (default enter)
 *   WEDGE_DRY_RUN  1 = hanya tampilkan di console, tanpa mengetik (untuk tes)
 */
import { execFile } from "node:child_process";
import { io, Socket } from "socket.io-client";

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:3000";
const ONLY_SCANNER = (process.env.WEDGE_SCANNER ?? "").trim();
const SUFFIX = (process.env.WEDGE_SUFFIX ?? "enter").toLowerCase();
const DRY_RUN = process.env.WEDGE_DRY_RUN === "1";

function escapeSendKeys(s: string): string {
  // Karakter khusus SendKeys: + ^ % ~ ( ) { } [ ]
  return s.replace(/([+^%~(){}[\]])/g, "{$1}");
}

function typeWithPowerShell(text: string): Promise<void> {
  const suffix = SUFFIX === "tab" ? "{TAB}" : SUFFIX === "none" ? "" : "{ENTER}";
  const payload = escapeSendKeys(text) + suffix;
  // SendKeys via WScript.Shell — bawaan Windows, tanpa dependensi tambahan.
  const ps = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${payload.replace(/'/g, "''")}')`;
  return new Promise((resolve, reject) => {
    execFile("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function typeLinux(text: string): Promise<void> {
  // Opsional: butuh xdotool terinstal (sudo apt install xdotool).
  const suffix = SUFFIX === "tab" ? "Tab" : SUFFIX === "none" ? "" : "Return";
  const args = ["type", "--delay", "8", "--", text];
  return new Promise((resolve, reject) => {
    execFile("xdotool", args, (err) => {
      if (err) return reject(new Error("xdotool tidak tersedia. Install: sudo apt install xdotool"));
      if (!suffix) return resolve();
      execFile("xdotool", ["key", suffix], (err2) => (err2 ? reject(err2) : resolve()));
    });
  });
}

async function typeText(text: string): Promise<void> {
  if (DRY_RUN) {
    console.log(`[dry-run] would type: ${text} + ${SUFFIX}`);
    return;
  }
  if (process.platform === "win32") return typeWithPowerShell(text);
  if (process.platform === "linux") return typeLinux(text);
  throw new Error(`Platform ${process.platform} belum didukung wedge (didukung: Windows, Linux+xdotool).`);
}

// Antrean agar ketikan berurutan walau scan datang cepat.
let chain: Promise<void> = Promise.resolve();

function enqueue(text: string) {
  chain = chain.then(() => typeText(text)).catch((e) => console.error("Gagal mengetik:", (e as Error).message));
  return chain;
}

const socket: Socket = io(SERVER_URL, { reconnection: true });

socket.on("connect", () => {
  console.log(`Wedge terhubung ke ${SERVER_URL}. Klik field target, lalu scan dari HP.`);
  if (ONLY_SCANNER) console.log(`Filter: hanya Scanner ID ${ONLY_SCANNER}`);
});

socket.on("disconnect", () => console.log("Wedge terputus, mencoba sambung ulang…"));

socket.on("server:scan", (data: { scan?: { barcode: string; scanner_id: string }; status?: string }) => {
  if (!data?.scan) return;
  if (data.status === "Ignored") return; // duplikat jangan diketik
  if (ONLY_SCANNER && data.scan.scanner_id !== ONLY_SCANNER) return;
  console.log(`Scan: ${data.scan.barcode} (${data.scan.scanner_id}) → mengetik…`);
  enqueue(data.scan.barcode);
});
