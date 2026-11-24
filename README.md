# Ekstensi Chrome: Detektor Persediaan Nota BMN (Computer Vision Klasik + Tesseract OCR)

Ekstensi Google Chrome (Manifest V3) ini mengekstrak teks dan tabel dari foto nota belanja **tanpa AI**, menggunakan alur **Computer Vision klasik** (Grayscale, Binarisasi Thresholding, Operasi Morfologi Erosi & Dilasi untuk Deteksi Grid Tabel, Pembesaran ROI 2x) dan **Tesseract OCR**, lalu mengklasifikasikan setiap item ke **404 Kode Barang** dari file `Daftar Kode Barang dan Catatan.xls` (Sheet: `BMN_Persediaan`).

---

## Struktur Folder Ekstensi

```text
ekstensi_deteksi_persediaan/
├── manifest.json          # Konfigurasi Chrome Extension Manifest V3
├── background.js          # Pembuka halaman kerja ekstensi saat ikon diklik
├── dashboard.html         # Antarmuka utama deteksi grid & klasifikasi BMN
├── styles.css             # Tata letak responsif dua panel
├── master_bmn.js          # Seluruh 404 kode barang sheet BMN_Persediaan + kamus sinonim
├── cv_ocr_engine.js       # Mesin Computer Vision (Morfologi Tabel + Fuzzy Matching)
├── app.js                 # Pengendali OCR, editor tabel, dan ekspor CSV/Excel
├── icons/                 # Ikon ekstensi (16px, 48px, 128px)
└── lib/                   # Pustaka lokal Tesseract.js (agar berjalan 100% offline)
    ├── tesseract.min.js
    ├── worker.min.js
    ├── tesseract-core.wasm.js
    └── lang/
        ├── ind.traineddata
        └── eng.traineddata
```

---

## Langkah 1: Unduh File Pustaka Lokal Tesseract.js (Agar 100% Offline & Bebas CSP Chrome)

Karena kebijakan keamanan Chrome Extension Manifest V3 melarang pemuatan skrip eksternal dari CDN, jalankan satu kali skrip PowerShell atau Python berikut untuk mengunduh 5 file pustaka Tesseract ke dalam folder `lib/`:

### Opsi A: Menggunakan PowerShell (Windows)
Buka PowerShell di dalam folder `ekstensi_deteksi_persediaan`, lalu tempel dan jalankan perintah ini:

```powershell
New-Item -ItemType Directory -Force -Path "lib\lang" | Out-Null
Invoke-WebRequest -Uri "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js" -OutFile "lib	esseract.min.js"
Invoke-WebRequest -Uri "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js" -OutFile "lib\worker.min.js"
Invoke-WebRequest -Uri "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0/tesseract-core.wasm.js" -OutFile "lib	esseract-core.wasm.js"
Invoke-WebRequest -Uri "https://tessdata.projectnaptha.com/4.0.0/ind.traineddata.gz" -OutFile "lib\lang\ind.traineddata.gz"
Invoke-WebRequest -Uri "https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz" -OutFile "lib\lang\eng.traineddata.gz"
```
*(Catatan: Jika menggunakan file `.gz`, ubah baris `gzip: false` menjadi `gzip: true` di dalam file `app.js` baris ke-185).*

---

## Langkah 2: Pasang Ekstensi di Google Chrome

1. Buka browser Google Chrome dan ketik `chrome://extensions/` pada bilah alamat.
2. Aktifkan sakelar **Developer mode** (Mode pengembang) di pojok kanan atas.
3. Klik tombol **Load unpacked** (Muat ekstensi yang belum dibuka kemasannya) di pojok kiri atas.
4. Pilih folder `ekstensi_deteksi_persediaan`.
5. Klik ikon ekstensi **Detektor Persediaan Nota BMN** di toolbar Chrome untuk membuka ruang kerja.

---

## Fitur Utama & Logika Pemetaan

1. **Prioritas Akun BPS (`117111` & `117113`):** Sesuai catatan pada Excel baris 186 (*"SATKER BPS MENGGUNAKAN KODE AKUN 117111 DAN 117113"*), klasifikasi otomatis memprioritaskan 113 kode barang pada akun **117111 (Barang Konsumsi)** dan **117113 (Bahan untuk Pemeliharaan)**, namun tetap menyediakan seluruh **404 kode** pada kolom pencarian manual.
2. **Pemetaan Kontekstual + Fuzzy Matching:** Menggabungkan aturan kamus persediaan kantor (misalnya merek *Vixal/Cling* $ightarrow$ `1010305008 Bahan Kimia Untuk Pembersih`, *Sapu/Sikat* $ightarrow$ `1010305001 Sapu Dan Sikat`, *Serok Sampah* $ightarrow$ `1010305004 Keset Dan Tempat Sampah`, *Lampu LED* $ightarrow$ `1010306002 Lampu Listrik`) dengan perhitungan kemiripan teks *Token Set Ratio + Levenshtein Distance*.
3. **Ekspor Siap Excel / SAKTI:** Menghasilkan file `.csv` dengan pemisah titik koma (`;`) dan proteksi 10 digit kode barang agar tidak terpotong oleh format angka otomatis Microsoft Excel.
