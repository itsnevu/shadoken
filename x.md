# 🥷 Shadoken — Game Overview & Architecture Specification

> **Shadoken** adalah game **2D Multiplayer Endless Gravity-Bending Platformer Race** berbasis Web3. Game ini menggabungkan fisika manipulasi gravitasi yang intens, kompetisi real-time PvP, dan integrasi blockchain untuk sistem *Prize Pool* serta NFT rewards.

---

## 📌 1. Gambaran Umum (Game Overview)

**Shadoken** mengajak pemain untuk mengendalikan sekelompok ninja (*school of ninjas*) dalam mengarungi ruangan demi ruangan (*chambers*) tanpa batas yang dipenuhi rintangan berbahaya. Berbeda dari platformer 2D tradisional, Shadoken memiliki mekanik utama **manipulasi gravitasi 90 derajat**, di mana pemain dapat memutar orientasi dunia tempat ninja berjalan secara instan.

Game ini dirancang modern dengan arsitektur **PWA (Progressive Web App)** yang ringan, *mobile-responsive*, serta ditenagai oleh **Colyseus Realtime Server** untuk mode multiplayer balapan langsung antar pemain (*live ghosts racing*).

---

## 🎯 2. Tujuan Utama Game (Game Objectives)

1. **Bertahan & Berlomba Sejauh Mungkin (Endless Chamber Race)**:
   - Mengarungi *chambers* acak terpola (seeded procedural generation) seraya menghindari rintangan mematikan seperti lava, mesin penghancur, laser, dan proyektil.
   - Mencapai **Chamber 10** dalam balapan real-time untuk memenangkan mode Arena Race.

2. **Perolehan Skor & Koin (Coin Streaks & Perfect Run)**:
   - Mengumpulkan koin untuk membangun *coin streaks*.
   - Mendapatkan bonus *Perfect Chamber* jika berhasil menyelesaikan satu chamber tanpa ada ninja dalam kelompok yang tewas.

3. **Sabotase Lawan dalam Multiplayer PvP**:
   - Memanfaat sistem *PvP Sabotage* untuk mengacaukan pergerakan pemain lain yang berada di dunia yang sama secara real-time.

4. **Kompetisi Web3 & On-Chain Rewards**:
   - Mendaftarkan skor run terbaik ke *Season Leaderboard*.
   - Melakukan klaim reward berbasis EIP-712 / Solana state proof langsung ke wallet pengguna (MetaMask / Solana Wallet).
   - Memenangkan *Prize Pool* musiman dan mencetak (*mint*) skin serta badge pencapaian sebagai NFT.

---

## ⚡ 3. Mekanik Gameplay Utama (Core Gameplay Mechanics)

### A. Kontrol Kelompok Ninja (*Swarm Control*)
Pemain tidak hanya mengendalikan 1 karakter tunggal, melainkan sekelompok ninja. Pertahanan kelompok bergantung pada kemampuan pemain menjaga jumlah ninja tetap hidup saat melintasi berbagai rintangan.

### B. Rotasi Gravitasi 90° (*Gravity-Bending Axis Rotation*)
- Pemain dapat menekan tombol rotasi untuk mengubah gravitasi 90° searah orientasi pandang ninja.
- Dinding atau atap seketika menjadi lantai baru.
- **Mekanik Nausea (Penalty)**: Jika pemain melakukan rotasi 3 kali berturut-turut secara cepat (*over-rotation*), kamera akan mengalami efek pusing (*nauseous*) dan kontrol akan terkunci sementara untuk mencegah spamming.

### C. Fisika Lingkungan & Rintangan (*Environment Physics & Obstacles*)
- **Zona Air**: Memiliki gravitasi lebih rendah dan daya apung. Ninja dapat berenang ke atas (*swim upward*), tetapi pergerakan melintang menjadi lebih lambat.
- **Zona Lava & Perangkap Mesin**: Kontak langsung akan mengeliminasi ninja secara instan.
- **Laser & Proyektil**: Laser aktif sesuai dengan orientasi gravitasi pemain.

### D. Sistem Sabotase PvP Real-Time
Pemain dapat menembakkan item sabotase untuk menguji refleks lawan dalam ruangan balapan:
- ⚡ **Shock Jam**: Mengunci/mengacaukan kontrol lawan.
- 🌀 **Gravity Scramble**: Memaksa arah gravitasi lawan berputar secara acak.
- 👥 **Shadow Clone**: Memunculkan bayangan ksatria penipu untuk membingungkan pandangan lawan.
- 🏹 **Arrow Rush**: Meluncurkan hujan panah ke lintasan lawan.

---

## 🛠️ 4. Spesifikasi Teknis & Stack Teknologi

| Komponen | Teknologi yang Digunakan |
|---|---|
| **Game Engine / Rendering** | Phaser 3 (Canvas/WebGL) + TypeScript (Strict) |
| **Build Tool & Bundler** | Vite + `vite-plugin-pwa` (Offline-ready & Installable) |
| **Multiplayer Server** | Colyseus (WebSocket Authoritative Relay ~15Hz) |
| **Web3 & Wallet Integration**| MetaMask (EIP-1193) / Web3 Provider & RobinhoodChain / Solana |
| **Smart Contracts** | EIP-712 Signed Claim Contracts, Season Prize Pool, Cosmetic Minting |

---

## 🎮 5. Kontrol Game (Game Controls)

| Aksi | Desktop (Keyboard) | Mobile (Touch UI) |
|---|---|---|
| **Gerak Kiri / Kanan** | `A` / `D` atau `←` / `→` | D-Pad Kiri / Kanan |
| **Lompat / Berenang** | `Space` atau `W` / `↑` | Tombol Jump (▲) |
| **Rotasi Gravitasi 90°** | `Shift` atau `R` | Tombol Rotasi (⟳) |
| **Tembak Sabotase** | `E` | Tombol Sabotase (⚡) |

---

## 🌐 6. Fitur Ekonomi & Web3 (Web3 Integration)

1. **Prize Pool Arena**: Pemain melakukan *deposit* ke smart contract untuk berpartisipasi dalam musim kompetisi.
2. **Signed Run Claim**: Setiap hasil balapan diverifikasi oleh server dan menghasilkan tanda tangan kriptografi (EIP-712 / Solana Signature) yang valid untuk diclaim on-chain.
3. **Cosmetics & Badges**: Skin eksklusif dan badge pencapaian balapan dapat di-mint sebagai aset digital.

---

## 🚀 7. Cara Menjalankan Game (Quick Run)

### Server Multiplayer
```bash
cd server
npm install
npm run dev
```

### Client Web
```bash
cd web
npm install
npm run dev
```
Buka `http://localhost:5173` di browser, hubungkan Wallet, dan mulai balapan!
