# TelU LMS Deadline Widget

Widget desktop sederhana untuk Windows yang mengambil deadline tugas dari URL export calendar LMS Telkom University dan menampilkannya sebagai daftar tugas.

## Fitur

- Window kecil yang bisa digeser dan tidak selalu di atas jendela lain.
- Menyimpan URL kalender secara lokal di folder data aplikasi Electron.
- Refresh manual dan refresh otomatis berkala.
- Setup awal satu kali, lalu UI berubah menjadi mode ringkas berisi task dan tombol refresh.
- Jendela autentikasi akan menutup otomatis setelah sesi LMS valid.
- Parsing kalender `ICS` untuk menampilkan deadline terdekat.

## Menjalankan

1. Install dependency:

   ```powershell
   .\install-deps.cmd
   ```

2. Jalankan aplikasinya:

   ```powershell
   .\start-widget.cmd
   ```

3. Paste URL export calendar LMS Anda ke field `Calendar export URL`.
4. Klik `Simpan & autentikasi`, lalu login atau selesaikan Cloudflare di jendela LMS yang terbuka.
5. Setelah sesi valid, jendela autentikasi akan tertutup otomatis dan widget langsung menampilkan task Anda.

## Catatan

- URL export yang berisi `authtoken` bersifat sensitif. Aplikasi ini menyimpannya di profil lokal Electron, bukan di source code.
- LMS Moodle umumnya mengekspor kalender dalam format `ICS`, dan widget ini membaca event dari format tersebut.
- Jika `npm start` biasa bermasalah di Windows karena `PATH`, gunakan launcher `start-widget.cmd` yang sudah disiapkan.
- Jendela autentikasi tidak membuka URL export kalender secara langsung, karena URL tersebut biasanya memicu prompt download file `icalexport.ics`.
