// Debounce logic: same (scannerId, barcode) within window => Ignored. Dikurangi ke 1000ms biar lebih responsive.
const DEBOUNCE_MS = Number(process.env.DEBOUNCE_MS ?? 1000);

const lastAccepted = new Map<string, number>();

export function getDebounceMs(): number {
  return DEBOUNCE_MS;
}

export function shouldAccept(scannerId: string, barcode: string, now = Date.now()): boolean {
  const key = `${scannerId}::${barcode}`;
  const last = lastAccepted.get(key);
  if (last !== undefined && now - last < DEBOUNCE_MS) return false;
  lastAccepted.set(key, now);
  return true;
}

export function clearDebounce(): void {
  lastAccepted.clear();
}
