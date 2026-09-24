# Product Requirements Document (PRD)

## Wireless Barcode Scanner Server

**Version:** 1.0
**Status:** MVP
**Platform:** Node.js Server + Web Scanner
**Primary Use Case:** Menjadikan HP sebagai barcode scanner wireless yang mengirim hasil scan melalui jaringan ke PC server dan menyimpan hasilnya ke Excel.

---

## 1. Product Overview

Aplikasi ini memungkinkan smartphone digunakan sebagai **barcode scanner berbasis kamera** tanpa membutuhkan scanner USB/Bluetooth.

PC A menjalankan Node.js Server sebagai pusat komunikasi. Smartphone terhubung ke server melalui jaringan Wi-Fi/LAN dan digunakan untuk melakukan scanning barcode.

### Basic Flow

```text
📱 HP
Camera
   ↓
Scan Barcode
   ↓
Barcode Decoder
   ↓
Wi-Fi / LAN
   ↓
💻 PC A
Node.js Server
   ↓
Record Scan
   ↓
📊 Excel
```

Aplikasi harus bersifat **generic**, sehingga tidak bergantung pada Estoq atau sistem ERP tertentu.

---

# 2. Goals

### Primary Goals

1. HP dapat digunakan sebagai barcode scanner menggunakan kamera.
2. HP dapat terhubung ke Node.js Server melalui jaringan lokal.
3. Hasil scan dikirim secara realtime ke server.
4. Server menerima dan mencatat setiap hasil scan.
5. Data scan dapat diekspor ke Excel.
6. Scanner dapat terus melakukan scanning tanpa harus reload halaman.
7. Server dapat menerima lebih dari satu HP.
8. Setiap HP dapat memiliki Scanner ID.

### Non-Goals untuk MVP

MVP tidak mencakup:

* Authentication/login kompleks.
* ERP integration.
* Inventory transaction.
* Stock management.
* User management.
* Cloud synchronization.
* Native Android application.
* Bluetooth scanner integration.
* USB scanner integration.
* Barcode printing.

---

# 3. User Roles

## Server User

Pengguna yang menjalankan aplikasi pada PC A.

Tugas:

* Menjalankan server.
* Melihat scanner yang terhubung.
* Melihat hasil scan.
* Melihat jumlah scan.
* Export data ke Excel.

## Scanner User

Pengguna yang menggunakan HP.

Tugas:

* Membuka scanner.
* Mengizinkan akses kamera.
* Melakukan scan barcode.

Tidak diperlukan login pada MVP.

---

# 4. System Architecture

```text
                  Local Network
             Wi-Fi / LAN
                    │
       ┌────────────┴────────────┐
       │                         │
   📱 HP #1                  📱 HP #2
   Scanner                   Scanner
       │                         │
       └──────────┬──────────────┘
                  │
                  ▼
          ┌─────────────────┐
          │   PC A          │
          │ Node.js Server  │
          │                 │
          │ REST API        │
          │ WebSocket       │
          │ Scan Manager    │
          └────────┬────────┘
                   │
                   ▼
             Scan Storage
                   │
                   ▼
              Excel Export
```

---

# 5. Technology Requirements

## Backend

* Node.js
* TypeScript
* Express
* WebSocket / Socket.IO
* ExcelJS
* Optional SQLite untuk persistent storage

## Frontend

* React / Vite
* Responsive mobile UI
* PWA
* Camera API
* Barcode decoding library/API

Barcode decoding dilakukan di HP agar server tidak perlu menerima video kamera.

---

# 6. Network Requirements

PC A dan HP harus berada dalam jaringan yang dapat saling berkomunikasi.

Contoh:

```text
PC A
192.168.1.100:3000
```

HP membuka:

```text
http://192.168.1.100:3000
```

Server harus listen pada network interface yang dapat diakses HP.

Contoh:

```text
0.0.0.0:3000
```

Windows Firewall harus mengizinkan koneksi ke port aplikasi.

---

# 7. Scanner Flow

## 7.1 Connect Scanner

User membuka alamat server dari HP.

```text
http://192.168.1.100:3000/scanner
```

HP menampilkan halaman scanner.

User memilih atau mendapatkan Scanner ID:

```text
Scanner ID
[ HP-01 ]
```

Kemudian scanner melakukan connection ke server.

Server mencatat:

```text
Scanner ID
Connection Status
Last Activity
```

---

## 7.2 Camera Permission

Saat pertama kali membuka scanner:

```text
Camera permission required

[ Allow Camera ]
```

Jika permission diberikan, camera scanner aktif.

Jika ditolak:

```text
Camera access is required to scan barcode.
```

---

# 8. Barcode Scanning

Scanner harus bekerja dalam continuous scanning mode.

Flow:

```text
Camera ON
   ↓
Detect Barcode
   ↓
Decode Barcode
   ↓
Send Result
   ↓
Show Success
   ↓
Camera tetap ON
   ↓
Ready for next scan
```

User tidak perlu menekan tombol scan setiap barcode.

---

# 9. Scan Result

Setiap scan minimal memiliki data:

```text
Scan ID
Barcode
Scanner ID
Timestamp
```

Contoh:

```json
{
  "barcode": "899123456789",
  "scannerId": "HP-01",
  "timestamp": "2026-09-24T20:30:00+07:00"
}
```

---

# 10. Duplicate Scan Handling

MVP harus memiliki mekanisme untuk mencegah accidental duplicate scan.

Contoh:

```text
899123456789
899123456789
```

dalam waktu sangat singkat tidak langsung dianggap sebagai dua scan.

Default debounce:

```text
1–2 seconds
```

Jika barcode yang sama discan setelah melewati debounce window, barcode tersebut dianggap sebagai scan baru.

Contoh:

```text
20:30:01  899123456789  → ACCEPT
20:30:01  899123456789  → IGNORE
20:30:05  899123456789  → ACCEPT
```

Nilai debounce harus configurable di kemudian hari.

---

# 11. Scanner UI

UI harus sederhana dan fokus pada scanning.

```text
┌────────────────────────────┐
│      BARCODE SCANNER       │
├────────────────────────────┤
│ Scanner: HP-01             │
│ ● Connected                │
├────────────────────────────┤
│                            │
│       CAMERA VIEW          │
│                            │
│       ───────────          │
│                            │
├────────────────────────────┤
│ Last Scan                  │
│                            │
│ 899123456789       ✓       │
│                            │
│ Total Scan: 128            │
└────────────────────────────┘
```

### Required UI

* Camera preview
* Scanner ID
* Connection status
* Last scanned barcode
* Total scan count
* Scan history
* Success feedback
* Error feedback

---

# 12. Scan Feedback

Setiap barcode berhasil dibaca harus memberikan feedback.

Minimum:

* Visual feedback
* Beep sound
* Vibration jika device mendukung

Success:

```text
✓ Scan successful
899123456789
```

Error:

```text
✕ Scan failed
```

---

# 13. Server Dashboard

PC A harus memiliki dashboard.

```text
┌─────────────────────────────────────┐
│ Wireless Barcode Scanner            │
├─────────────────────────────────────┤
│ Server: ● Running                   │
│                                     │
│ Connected Scanner     Total Scan    │
│ HP-01 ●                 128         │
│ HP-02 ●                  96         │
├─────────────────────────────────────┤
│ Recent Scans                        │
│                                     │
│ Time      Scanner   Barcode         │
│ 20:31:02  HP-01     899123456789    │
│ 20:31:08  HP-02     899123456790    │
│ 20:31:15  HP-01     899123456791    │
└─────────────────────────────────────┘
```

Dashboard menerima update secara realtime menggunakan WebSocket.

---

# 14. Scan History

Server menyimpan history scan.

Required fields:

| Field      | Description                |
| ---------- | -------------------------- |
| Scan ID    | Unique scan record         |
| Barcode    | Barcode value              |
| Scanner ID | Device yang melakukan scan |
| Timestamp  | Waktu scan                 |
| Status     | Accepted / Ignored / Error |

History dapat ditampilkan berdasarkan:

* Scanner
* Barcode
* Date/time

---

# 15. Excel Export

User dapat melakukan:

```text
[ Export Excel ]
```

Server menghasilkan:

```text
barcode-scan-2026-09-24.xlsx
```

Format:

| No | Barcode      | Scanner ID | Scan Time | Status   |
| -: | ------------ | ---------- | --------- | -------- |
|  1 | 899123456789 | HP-01      | 20:31:02  | Accepted |
|  2 | 899123456790 | HP-01      | 20:31:08  | Accepted |
|  3 | 899123456791 | HP-02      | 20:31:15  | Accepted |

Excel adalah **output/export**, bukan sumber data utama.

---

# 16. Data Storage

Untuk MVP sederhana, server dapat menggunakan SQLite.

```text
scanner.db
```

Table:

```text
scans
├── id
├── barcode
├── scanner_id
├── scanned_at
└── status
```

Keuntungan:

* Data tidak hilang ketika server restart.
* Bisa menangani banyak scan.
* Tidak bergantung pada Excel.
* Excel dapat dibuat berdasarkan data yang tersimpan.

---

# 17. API Requirements

## Health Check

```text
GET /api/health
```

Response:

```json
{
  "status": "ok"
}
```

## Submit Scan

```text
POST /api/scan
```

Request:

```json
{
  "barcode": "899123456789",
  "scannerId": "HP-01"
}
```

## Get Scan History

```text
GET /api/scans
```

## Export Excel

```text
GET /api/scans/export
```

---

# 18. WebSocket Requirements

WebSocket digunakan untuk komunikasi realtime.

Events:

```text
scanner:connect
scanner:disconnect
scanner:scan
server:scan
server:status
```

Contoh:

```text
HP
  │
  │ scanner:scan
  ▼
Node.js
  │
  ├── Save scan
  │
  └── server:scan
          │
          ▼
      Dashboard
```

---

# 19. Multiple Scanner Support

Server harus dapat menerima beberapa HP secara bersamaan.

Contoh:

```text
HP-01 ─┐
HP-02 ─┤
HP-03 ─┼──► Node.js Server
HP-04 ─┘
```

Setiap scan harus menyimpan Scanner ID.

Contoh:

```text
HP-01 → 899123456789
HP-02 → 899123456790
HP-03 → 899123456791
```

---

# 20. Connection Status

Scanner harus memiliki status:

```text
● Connected
○ Disconnected
```

Server dashboard menampilkan:

* Scanner ID
* Connected/disconnected
* Last scan
* Last activity
* Total scan

Jika HP kehilangan koneksi, server harus mendeteksi disconnect.

---

# 21. Offline Handling

Untuk MVP:

Jika HP kehilangan koneksi:

```text
Camera
  ↓
Scan
  ↓
No connection
```

Scanner harus menampilkan:

```text
⚠ Server disconnected
```

Scan tidak dianggap berhasil sampai server menerima data.

Future version dapat menambahkan local queue:

```text
HP
 ↓
Local Queue
 ↓
Network kembali
 ↓
Sync Server
```

---

# 22. Security

MVP hanya ditujukan untuk jaringan lokal.

Minimum:

* Server tidak membutuhkan public internet.
* Scanner hanya dapat digunakan oleh client yang dapat mengakses server.
* Jangan expose port scanner ke internet secara langsung.

Future:

* Scanner pairing code
* Authentication
* HTTPS
* Access token
* Device authorization

---

# 23. Performance Requirements

Target MVP:

* Barcode detection: realtime pada device yang mendukung.
* Scan result sampai server: < 500 ms pada LAN normal.
* Minimal 5 scanner concurrent.
* Minimal 1.000 scan per session.
* Tidak reload halaman setelah scan.
* Camera tetap aktif selama scanning.

---

# 24. Error Handling

### Camera Error

```text
Camera unavailable
```

### Server Error

```text
Unable to connect to server
```

### Invalid Barcode

```text
Invalid barcode
```

### Duplicate

```text
Already scanned
```

### Network Lost

```text
Connection lost
```

Error harus ditampilkan secara jelas dan tidak menyebabkan aplikasi scanner crash.

---

# 25. MVP Acceptance Criteria

MVP dianggap selesai apabila:

* [ ] Node.js server dapat dijalankan di PC A.
* [ ] HP dapat membuka scanner melalui IP PC A.
* [ ] HP dapat meminta camera permission.
* [ ] Kamera dapat membaca barcode.
* [ ] Barcode dapat dikirim melalui LAN/Wi-Fi.
* [ ] Node.js menerima barcode.
* [ ] Scan muncul realtime di dashboard PC.
* [ ] Scanner ID tercatat.
* [ ] Timestamp tercatat.
* [ ] Continuous scanning bekerja.
* [ ] Duplicate debounce bekerja.
* [ ] Multiple HP dapat terhubung.
* [ ] Scan history tersedia.
* [ ] Data dapat diekspor ke `.xlsx`.
* [ ] Server tetap berjalan setelah HP disconnect/reconnect.
* [ ] Tidak diperlukan USB scanner.
* [ ] Tidak diperlukan aplikasi native Android untuk MVP.

---

# 26. Future Development

Setelah MVP stabil, fitur berikut dapat ditambahkan:

### Scanner Management

* Pair scanner
* Rename scanner
* Scanner location
* Scanner status
* Scanner authorization

### Scan Modes

* Continuous scan
* Single scan
* Batch scan
* Quantity scan

### Data

* CSV export
* Excel template
* Import barcode list
* Barcode validation
* Duplicate rules

### Integration

* REST API
* Webhook
* WebSocket API
* Estoq integration
* ERP integration

### Mobile

* Installable PWA
* Fullscreen scanner
* Better vibration/beep control
* Offline queue
* Background synchronization

---

# 27. Recommended Development Order

## Phase 1 — Server

```text
Node.js
 ↓
Express
 ↓
Health API
 ↓
WebSocket
```

## Phase 2 — Mobile Scanner

```text
Mobile Web
 ↓
Camera
 ↓
Barcode Decoder
 ↓
Scan Result
```

## Phase 3 — Communication

```text
HP
 ↓ WebSocket
Node.js
 ↓
Dashboard
```

## Phase 4 — Storage

```text
Scan
 ↓
SQLite
 ↓
History
```

## Phase 5 — Excel

```text
SQLite
 ↓
ExcelJS
 ↓
.xlsx
```

## Phase 6 — Multi Scanner

```text
HP-01
HP-02
HP-03
 ↓
Node.js
```

## Phase 7 — Hardening

* Error handling
* Reconnection
* Duplicate protection
* Performance
* Network handling
* Scanner identification

---

# 28. Product Principle

Aplikasi harus mengikuti prinsip:

> **HP adalah scanner. PC A adalah server. Node.js adalah communication layer dan data processor. Excel adalah output.**

Jangan membuat sistem bergantung pada Excel sebagai database.

Core architecture:

```text
        📱
    HP Scanner
         │
         │ Wi-Fi/LAN
         ▼
   ┌─────────────┐
   │  Node.js    │
   │   Server    │
   └──────┬──────┘
          │
      ┌───┴────┐
      ▼        ▼
   SQLite    WebSocket
      │        │
      ▼        ▼
   Excel    Dashboard
```

Dengan arsitektur ini, aplikasi dapat digunakan sebagai **wireless barcode scanner platform** dan nantinya dapat diintegrasikan dengan aplikasi lain tanpa mengubah mekanisme scanning di HP.
