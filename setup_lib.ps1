# Skrip Otomatis Mengunduh Tesseract.js & Data Bahasa (Indonesia + Inggris) ke Folder lib/
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path "lib\lang" | Out-Null

Write-Host "1/5 Mengunduh tesseract.min.js..."
Invoke-WebRequest -Uri "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js" -OutFile "lib\tesseract.min.js"

Write-Host "2/5 Mengunduh worker.min.js..."
Invoke-WebRequest -Uri "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js" -OutFile "lib\worker.min.js"

Write-Host "3/5 Mengunduh tesseract-core.wasm.js..."
Invoke-WebRequest -Uri "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0/tesseract-core.wasm.js" -OutFile "lib\tesseract-core.wasm.js"

Write-Host "4/5 Mengunduh kamus OCR Bahasa Indonesia (ind.traineddata)..."
Invoke-WebRequest -Uri "https://github.com/naptha/tessdata/raw/gh-pages/4.0.0_best/ind.traineddata.gz" -OutFile "lib\lang\ind.traineddata.gz"

Write-Host "5/5 Mengunduh kamus OCR Bahasa Inggris (eng.traineddata)..."
Invoke-WebRequest -Uri "https://github.com/naptha/tessdata/raw/gh-pages/4.0.0_best/eng.traineddata.gz" -OutFile "lib\lang\eng.traineddata.gz"

# Update app.js agar membaca format .gz secara langsung
$appJsPath = "app.js"
$content = Get-Content $appJsPath -Raw
$content = $content -replace "gzip: false", "gzip: true"
Set-Content -Path $appJsPath -Value $content -Encoding UTF8

Write-Host "Selesai! Silakan muat folder ini di chrome://extensions/ (Load unpacked)." -ForegroundColor Green
