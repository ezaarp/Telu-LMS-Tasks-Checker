# TelU LMS Tasks Checker

Desktop app Windows untuk melihat task LMS Telkom University dari calendar export `ICS`, menata task ke board `Due Today / To Do / Done`, dan membagikan aplikasi ke user awam tanpa terminal.

## Untuk User Umum

Unduh aplikasi dari halaman Releases GitHub:

- Installer Windows: jalankan file installer lalu ikuti langkah install
- Portable build: ekstrak lalu double-click file `.exe`

Setelah aplikasi terbuka:

1. Paste URL export kalender LMS Anda
2. Klik `Simpan & autentikasi`
3. Login / selesaikan Cloudflare
4. Widget akan sinkron otomatis dan siap dipakai

## Fitur

- Board task `Due Today`, `To Do`, dan `Done`
- Drag-and-drop task ke kolom `Done`
- Countdown deadline dan warna prioritas
- Deskripsi task yang bisa di-expand
- Tombol langsung ke assignment LMS jika link tersedia
- Settings panel untuk update URL `ICS` kapan saja
- Auto update dari GitHub Releases pada build terpaket

## Menjalankan Untuk Development

1. Install dependency:

   ```powershell
   .\install-deps.cmd
   ```

2. Jalankan app:

   ```powershell
   .\start-widget.cmd
   ```

## Build Distribusi Windows

Build folder output akan dibuat di [dist](C:/Users/andra/Downloads/codex_project/dist).

1. Build installer + portable:

   ```powershell
   npm run dist
   ```

2. Build unpacked folder untuk testing lokal:

   ```powershell
   npm run pack
   ```

## Publish Release ke GitHub

Repo publish target:

- [ezaarp/Telu-LMS-Deadline-Widget](https://github.com/ezaarp/Telu-LMS-Deadline-Widget)

Sebelum publish, set `GH_TOKEN` ke Personal Access Token GitHub yang punya izin membuat release.

Contoh PowerShell:

```powershell
$env:GH_TOKEN="YOUR_GITHUB_TOKEN"
npm run release
```

Perintah itu akan:

- build installer Windows
- build portable artifact
- upload artifacts ke GitHub Releases

## Catatan

- URL export `ICS` berisi `authtoken`, jadi perlakukan sebagai data sensitif.
- Auto update hanya aktif pada build terpaket, bukan saat development lewat terminal.
- Icon installer/app menggunakan resource di folder [build](C:/Users/andra/Downloads/codex_project/build).
