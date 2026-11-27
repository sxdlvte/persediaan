/**
 * Pengendali Antarmuka Detektor Persediaan Nota BMN
 * Versi 2.8: Hybrid PaddleOCR + Tesseract.js + Editor Master BMN (Paging & Scroll)
 */

const cvEngine = new NotaCVEngine();
let currentImage = null;
let originalCanvas = document.createElement("canvas");
let binaryCanvas = document.createElement("canvas");
let overlayCanvas = document.createElement("canvas");
let activeView = "overlay";
let extractedRows = [];

// Konfigurasi Server Lokal PaddleOCR
const PADDLE_API_URL = "https://sxdlvte-persediaan1.static.hf.space";
let lastPaddleError = "";

// Penyimpanan Master BMN Aktif (otomatis sinkron jika master_bmn.js diperbarui)
const MASTER_STORAGE_KEY = "bmn_master_persediaan_custom_v1";
const MASTER_SIG_KEY = "bmn_master_persediaan_sig_v1";
const DEFAULT_MASTER_BACKUP = JSON.parse(JSON.stringify(MASTER_BMN_PERSEDIAAN));
let activeMasterList = loadActiveMasterList();

function getMasterSignature(list) {
  return `${list.length}_${list[0]?.kd_brg || ""}_${list[list.length - 1]?.kd_brg || ""}_${list[list.length - 1]?.ur_sskel || ""}`;
}

function loadActiveMasterList() {
  const currentFileSig = getMasterSignature(DEFAULT_MASTER_BACKUP);
  try {
    const savedSig = localStorage.getItem(MASTER_SIG_KEY);
    const saved = localStorage.getItem(MASTER_STORAGE_KEY);

    // Jika file master_bmn.js baru saja diedit/di-push, abaikan cache lama dan pakai file terbaru
    if (savedSig !== currentFileSig) {
      localStorage.removeItem(MASTER_STORAGE_KEY);
      localStorage.setItem(MASTER_SIG_KEY, currentFileSig);
      return JSON.parse(JSON.stringify(DEFAULT_MASTER_BACKUP));
    }

    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn("Gagal memuat custom master dari localStorage:", e);
  }
  localStorage.setItem(MASTER_SIG_KEY, currentFileSig);
  return JSON.parse(JSON.stringify(DEFAULT_MASTER_BACKUP));
}

// State Paging Modal Master
let masterCurrentPage = 1;
let masterPageSize = 25;

function loadActiveMasterList() {
  try {
    const saved = localStorage.getItem(MASTER_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn("Gagal memuat custom master dari localStorage:", e);
  }
  return JSON.parse(JSON.stringify(DEFAULT_MASTER_BACKUP));
}

function saveActiveMasterList() {
  try {
    localStorage.setItem(MASTER_STORAGE_KEY, JSON.stringify(activeMasterList));
  } catch (e) {
    console.warn("Gagal menyimpan custom master ke localStorage:", e);
  }
  initMasterReference();
  reclassifyAllExtractedRows();
}

function getDefaultUraianAkun(kdAkun) {
  if (kdAkun === "117111") return "Barang Konsumsi";
  if (kdAkun === "117113") return "Bahan untuk Pemeliharaan";
  if (kdAkun === "117114") return "Suku Cadang";
  if (kdAkun === "117131") return "Bahan Baku";
  if (kdAkun === "117199") return "Persediaan Lainnya";
  return "Persediaan";
}

// Referensi Elemen DOM
const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const previewCanvas = document.getElementById("previewCanvas");
const emptyCanvasHint = document.getElementById("emptyCanvasHint");
const threshSlider = document.getElementById("threshSlider");
const threshVal = document.getElementById("threshVal");
const kernelSlider = document.getElementById("kernelSlider");
const kernelVal = document.getElementById("kernelVal");
const btnReprocess = document.getElementById("btnReprocess");
const btnExportCsv = document.getElementById("btnExportCsv");
const btnAddRow = document.getElementById("btnAddRow");
const filterBpsCheck = document.getElementById("filterBpsCheck");
const statusBadge = document.getElementById("statusBadge");
const progressBox = document.getElementById("progressBox");
const progressLabel = document.getElementById("progressLabel");
const progressPct = document.getElementById("progressPct");
const progressFill = document.getElementById("progressFill");
const rawTextOutput = document.getElementById("rawTextOutput");
const resultBody = document.getElementById("resultBody");

// Menyusun Ulang Tampilan Modal Master Kode agar rapi, scrollable, & memiliki paging
function setupMasterModalEditorUI() {
  const modalOverlay = document.getElementById("masterModal");
  if (!modalOverlay) return;

  if (!document.getElementById("masterModalModernStyle")) {
    const style = document.createElement("style");
    style.id = "masterModalModernStyle";
    style.textContent = `
      #masterModal {
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        background: rgba(15, 23, 42, 0.55) !important;
        backdrop-filter: blur(2px) !important;
        z-index: 9999 !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 16px !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
      }
      #masterModal > div {
        background: #ffffff !important;
        width: 100% !important;
        max-width: 1080px !important;
        height: 90vh !important;
        max-height: 90vh !important;
        margin: 0 auto !important;
        border-radius: 14px !important;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25) !important;
        display: flex !important;
        flex-direction: column !important;
        overflow: hidden !important;
        padding: 18px 22px !important;
        box-sizing: border-box !important;
      }
      .bmn-modal-header {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: 12px;
        border-bottom: 1px solid #e2e8f0;
        margin-bottom: 12px;
      }
      .bmn-modal-header h3 {
        margin: 0;
        font-size: 16.5px;
        font-weight: 700;
        color: #0f172a;
      }
      .bmn-close-btn {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        border: 1px solid #e2e8f0;
        background: #f8fafc;
        color: #475569;
        font-size: 20px;
        line-height: 1;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .bmn-close-btn:hover {
        background: #fee2e2;
        color: #dc2626;
        border-color: #fecaca;
      }
      .bmn-editor-bar {
        flex-shrink: 0;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        justify-content: space-between;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        padding: 9px 12px;
        margin-bottom: 10px;
      }
      .bmn-editor-inputs {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      .bmn-editor-inputs input,
      .bmn-editor-inputs select {
        height: 33px;
        padding: 0 10px;
        border: 1px solid #cbd5e1;
        border-radius: 7px;
        font-size: 12.5px;
        background: #ffffff;
        color: #1e293b;
        box-sizing: border-box;
      }
      .bmn-editor-actions {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .bmn-btn {
        height: 33px;
        padding: 0 13px;
        border-radius: 7px;
        font-size: 12.5px;
        font-weight: 600;
        cursor: pointer;
        border: 1px solid transparent;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s;
      }
      .bmn-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .bmn-btn-primary {
        background: #2563eb;
        color: #ffffff;
      }
      .bmn-btn-primary:hover:not(:disabled) {
        background: #1d4ed8;
      }
      .bmn-btn-outline {
        background: #ffffff;
        color: #334155;
        border-color: #cbd5e1;
      }
      .bmn-btn-outline:hover:not(:disabled) {
        background: #f1f5f9;
      }
      .bmn-btn-danger-outline {
        background: #ffffff;
        color: #dc2626;
        border-color: #fecaca;
      }
      .bmn-btn-danger-outline:hover:not(:disabled) {
        background: #fef2f2;
      }
      .bmn-search-wrap {
        flex-shrink: 0;
        display: flex;
        gap: 10px;
        align-items: center;
        margin-bottom: 10px;
      }
      .bmn-search-wrap input {
        flex: 1;
        height: 36px;
        padding: 0 14px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        font-size: 13px;
        box-sizing: border-box;
        outline: none;
      }
      .bmn-search-wrap input:focus {
        border-color: #2563eb;
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
      }
      .bmn-table-scroll {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        overflow-x: auto;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        background: #ffffff;
      }
      .bmn-table-scroll::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }
      .bmn-table-scroll::-webkit-scrollbar-thumb {
        background: #cbd5e1;
        border-radius: 4px;
      }
      .bmn-table-scroll table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      .bmn-table-scroll thead th {
        position: sticky;
        top: 0;
        z-index: 5;
        background: #f1f5f9;
        color: #1e293b;
        font-weight: 700;
        text-align: left;
        padding: 10px 12px;
        border-bottom: 2px solid #cbd5e1;
      }
      .bmn-table-scroll tbody td {
        padding: 8px 12px;
        border-bottom: 1px solid #f1f5f9;
        color: #334155;
        vertical-align: middle;
      }
      .bmn-table-scroll tbody tr:hover {
        background: #f8fafc;
      }
      .bmn-paging-footer {
        flex-shrink: 0;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding-top: 12px;
        margin-top: 10px;
        border-top: 1px solid #e2e8f0;
        font-size: 12.5px;
        color: #475569;
      }
    `;
    document.head.appendChild(style);
  }

  const dialogBox = modalOverlay.firstElementChild;
  if (!dialogBox || dialogBox.dataset.upgraded === "true") return;
  dialogBox.dataset.upgraded = "true";

  dialogBox.innerHTML = `
    <div class="bmn-modal-header">
      <h3>Referensi & Editor Master BMN_Persediaan</h3>
      <button type="button" id="closeModal" class="bmn-close-btn" title="Tutup">&times;</button>
    </div>

    <div class="bmn-editor-bar">
      <div class="bmn-editor-inputs">
        <input type="text" id="newKdBrg" placeholder="Kode 10 digit (10103...)" style="width:165px;" />
        <input type="text" id="newUrSskel" placeholder="Nama / Uraian Barang..." style="width:235px;" />
        <select id="newKdAkun" style="width:185px;">
          <option value="117111">117111 - Barang Konsumsi</option>
          <option value="117113">117113 - Bahan Pemeliharaan</option>
          <option value="117114">117114 - Suku Cadang</option>
          <option value="117131">117131 - Bahan Baku</option>
          <option value="117199">117199 - Persediaan Lainnya</option>
        </select>
        <button type="button" id="btnAddMasterItem" class="bmn-btn bmn-btn-primary">+ Tambah Kode</button>
      </div>
      <div class="bmn-editor-actions">
        <button type="button" id="btnCopyMasterJs" class="bmn-btn bmn-btn-outline" title="Salin array JS untuk file master_bmn.js">Salin Kode JS</button>
        <button type="button" id="btnResetMaster" class="bmn-btn bmn-btn-danger-outline">Reset Default</button>
      </div>
    </div>

    <div class="bmn-search-wrap">
      <input type="text" id="searchMasterInput" placeholder="Cari kode barang (10103...), nama/uraian barang, atau kode akun (117111 / 117113)..." />
      <select id="masterPageSizeSelect" style="height:36px; padding:0 10px; border:1px solid #cbd5e1; border-radius:8px; font-size:12.5px; background:#fff;">
        <option value="25" selected>25 baris / hal</option>
        <option value="50">50 baris / hal</option>
        <option value="100">100 baris / hal</option>
        <option value="500">Semua baris</option>
      </select>
    </div>

    <div class="bmn-table-scroll" id="masterTableScrollBox">
      <table>
        <thead>
          <tr>
            <th style="width:140px;">Kode Barang</th>
            <th>Nama / Uraian Barang (ur_sskel)</th>
            <th style="width:100px;">Kode Akun</th>
            <th style="width:185px;">Uraian Akun</th>
            <th style="width:125px; text-align:center;">Aksi</th>
          </tr>
        </thead>
        <tbody id="masterTableBody"></tbody>
      </table>
    </div>

    <div class="bmn-paging-footer">
      <div id="masterPagingInfo">Menampilkan 0 - 0 dari 0 data</div>
      <div style="display:flex; align-items:center; gap:6px;">
        <button type="button" id="btnMasterPrevPage" class="bmn-btn bmn-btn-outline" style="height:30px; padding:0 10px;">&laquo; Sebelumnya</button>
        <span id="masterPageIndicator" style="font-weight:600; padding:0 6px;">Halaman 1 / 1</span>
        <button type="button" id="btnMasterNextPage" class="bmn-btn bmn-btn-outline" style="height:30px; padding:0 10px;">Berikutnya &raquo;</button>
      </div>
    </div>
  `;

  document.getElementById("closeModal").addEventListener("click", () => {
    modalOverlay.style.display = "none";
  });

  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) {
      modalOverlay.style.display = "none";
    }
  });

  document.getElementById("searchMasterInput").addEventListener("input", () => {
    masterCurrentPage = 1;
    renderMasterTablePaged();
  });

  document.getElementById("masterPageSizeSelect").addEventListener("change", (e) => {
    masterPageSize = parseInt(e.target.value, 10) || 25;
    masterCurrentPage = 1;
    renderMasterTablePaged();
  });

  document.getElementById("btnMasterPrevPage").addEventListener("click", () => {
    if (masterCurrentPage > 1) {
      masterCurrentPage--;
      renderMasterTablePaged();
      document.getElementById("masterTableScrollBox").scrollTop = 0;
    }
  });

  document.getElementById("btnMasterNextPage").addEventListener("click", () => {
    masterCurrentPage++;
    renderMasterTablePaged();
    document.getElementById("masterTableScrollBox").scrollTop = 0;
  });

  document.getElementById("btnAddMasterItem").addEventListener("click", () => {
    const kd = document.getElementById("newKdBrg").value.trim();
    const ur = document.getElementById("newUrSskel").value.trim();
    const akun = document.getElementById("newKdAkun").value.trim() || "117111";

    if (!kd || !ur) {
      alert("Isi Kode Barang (10 digit) dan Nama/Uraian Barang terlebih dahulu.");
      return;
    }
    if (activeMasterList.some((m) => m.kd_brg === kd)) {
      alert(`Kode barang ${kd} sudah ada di daftar master. Silakan cari dan edit baris tersebut.`);
      return;
    }

    activeMasterList.unshift({
      kd_brg: kd,
      ur_sskel: ur,
      kd_akun: akun,
      ur_akun: getDefaultUraianAkun(akun)
    });

    document.getElementById("newKdBrg").value = "";
    document.getElementById("newUrSskel").value = "";
    masterCurrentPage = 1;
    saveActiveMasterList();
    alert(`Kode ${kd} (${ur}) berhasil ditambahkan dan langsung aktif untuk deteksi nota!`);
  });

  document.getElementById("btnCopyMasterJs").addEventListener("click", async () => {
    const jsOutput =
      "const MASTER_BMN_PERSEDIAAN = " + JSON.stringify(activeMasterList, null, 2) + ";";
    try {
      await navigator.clipboard.writeText(jsOutput);
      alert(
        "Kode MASTER_BMN_PERSEDIAAN terbaru berhasil disalin!\n\nSilakan tempel ke file master_bmn.js di VS Code agar perubahan permanen di GitHub Pages."
      );
    } catch (err) {
      prompt("Salin manual kode berikut (Ctrl + C):", jsOutput);
    }
  });

  document.getElementById("btnResetMaster").addEventListener("click", () => {
    if (!confirm("Kembalikan seluruh data Master Kode ke pengaturan awal file master_bmn.js?")) return;
    localStorage.removeItem(MASTER_STORAGE_KEY);
    activeMasterList = JSON.parse(JSON.stringify(DEFAULT_MASTER_BACKUP));
    masterCurrentPage = 1;
    initMasterReference();
    reclassifyAllExtractedRows();
    alert("Master Kode berhasil dikembalikan ke pengaturan awal.");
  });
}

function initMasterReference() {
  setupMasterModalEditorUI();

  const datalist = document.getElementById("bmnDatalist");
  const btnMasterModal = document.getElementById("btnMasterModal");

  if (btnMasterModal) {
    btnMasterModal.textContent = `Lihat / Edit Master (${activeMasterList.length})`;
  }

  datalist.innerHTML = "";
  activeMasterList.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = `${item.kd_brg} - ${item.ur_sskel}`;
    datalist.appendChild(opt);
  });

  renderMasterTablePaged();
}

function renderMasterTablePaged() {
  const masterBody = document.getElementById("masterTableBody");
  const searchQuery = (document.getElementById("searchMasterInput")?.value || "").toLowerCase().trim();

  const filteredEntries = activeMasterList
    .map((item, originalIdx) => ({ item, originalIdx }))
    .filter(({ item }) => {
      if (!searchQuery) return true;
      const text = `${item.kd_brg} ${item.ur_sskel} ${item.kd_akun} ${item.ur_akun}`.toLowerCase();
      return text.includes(searchQuery);
    });

  const totalItems = filteredEntries.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / masterPageSize));
  if (masterCurrentPage > totalPages) masterCurrentPage = totalPages;
  if (masterCurrentPage < 1) masterCurrentPage = 1;

  const startIdx = (masterCurrentPage - 1) * masterPageSize;
  const endIdx = Math.min(startIdx + masterPageSize, totalItems);
  const pageSlice = filteredEntries.slice(startIdx, endIdx);

  const pagingInfo = document.getElementById("masterPagingInfo");
  const pageIndicator = document.getElementById("masterPageIndicator");
  const btnPrev = document.getElementById("btnMasterPrevPage");
  const btnNext = document.getElementById("btnMasterNextPage");

  if (pagingInfo) {
    pagingInfo.textContent =
      totalItems === 0
        ? "Tidak ada data yang cocok dengan pencarian"
        : `Menampilkan ${startIdx + 1} - ${endIdx} dari ${totalItems} kode barang`;
  }
  if (pageIndicator) {
    pageIndicator.textContent = `Halaman ${masterCurrentPage} / ${totalPages}`;
  }
  if (btnPrev) btnPrev.disabled = masterCurrentPage <= 1;
  if (btnNext) btnNext.disabled = masterCurrentPage >= totalPages;

  masterBody.innerHTML = "";

  pageSlice.forEach(({ item, originalIdx }) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td class="m-kd-cell" style="font-family:monospace; font-weight:700; color:#0f172a;">${escapeHtml(item.kd_brg)}</td>
      <td class="m-ur-cell">${escapeHtml(item.ur_sskel)}</td>
      <td class="m-akun-cell" style="font-weight:600;">${escapeHtml(item.kd_akun)}</td>
      <td class="m-urakun-cell">${escapeHtml(item.ur_akun)}</td>
      <td style="text-align:center; white-space:nowrap;">
        <button type="button" class="bmn-btn bmn-btn-outline btn-edit-m" style="height:28px; padding:0 10px; font-size:12px;">Edit</button>
        <button type="button" class="bmn-btn bmn-btn-danger-outline btn-del-m" style="height:28px; width:28px; padding:0; font-size:14px; margin-left:4px;" title="Hapus kode">&times;</button>
      </td>
    `;

    const btnEdit = tr.querySelector(".btn-edit-m");
    btnEdit.addEventListener("click", () => {
      const isEditing = btnEdit.dataset.editing === "true";
      if (!isEditing) {
        btnEdit.dataset.editing = "true";
        btnEdit.textContent = "Simpan";
        btnEdit.style.backgroundColor = "#16a34a";
        btnEdit.style.color = "#ffffff";
        btnEdit.style.borderColor = "#16a34a";

        tr.querySelector(".m-kd-cell").innerHTML = `<input type="text" class="edit-kd-inp" value="${escapeHtml(item.kd_brg)}" style="width:120px; height:30px; padding:0 6px; border:1px solid #2563eb; border-radius:6px; font-family:monospace; font-size:12.5px; box-sizing:border-box;" />`;
        tr.querySelector(".m-ur-cell").innerHTML = `<input type="text" class="edit-ur-inp" value="${escapeHtml(item.ur_sskel)}" style="width:100%; height:30px; padding:0 8px; border:1px solid #2563eb; border-radius:6px; font-size:12.5px; box-sizing:border-box;" />`;
        tr.querySelector(".m-akun-cell").innerHTML = `
          <select class="edit-akun-inp" style="height:30px; padding:0 6px; border:1px solid #2563eb; border-radius:6px; font-size:12.5px; background:#fff;">
            <option value="117111" ${item.kd_akun === "117111" ? "selected" : ""}>117111</option>
            <option value="117113" ${item.kd_akun === "117113" ? "selected" : ""}>117113</option>
            <option value="117114" ${item.kd_akun === "117114" ? "selected" : ""}>117114</option>
            <option value="117131" ${item.kd_akun === "117131" ? "selected" : ""}>117131</option>
            <option value="117199" ${item.kd_akun === "117199" ? "selected" : ""}>117199</option>
          </select>
        `;
        tr.querySelector(".m-urakun-cell").innerHTML = `<input type="text" class="edit-urakun-inp" value="${escapeHtml(item.ur_akun)}" style="width:100%; height:30px; padding:0 8px; border:1px solid #2563eb; border-radius:6px; font-size:12.5px; box-sizing:border-box;" />`;

        const selAkun = tr.querySelector(".edit-akun-inp");
        const inpUrAkun = tr.querySelector(".edit-urakun-inp");
        selAkun.addEventListener("change", () => {
          inpUrAkun.value = getDefaultUraianAkun(selAkun.value);
        });
      } else {
        const newKd = tr.querySelector(".edit-kd-inp").value.trim() || item.kd_brg;
        const newUr = tr.querySelector(".edit-ur-inp").value.trim();
        const newAkun = tr.querySelector(".edit-akun-inp").value.trim() || "117111";
        const newUrAkun = tr.querySelector(".edit-urakun-inp").value.trim() || getDefaultUraianAkun(newAkun);

        if (newUr) {
          activeMasterList[originalIdx].kd_brg = newKd;
          activeMasterList[originalIdx].ur_sskel = newUr;
          activeMasterList[originalIdx].kd_akun = newAkun;
          activeMasterList[originalIdx].ur_akun = newUrAkun;
          saveActiveMasterList();
        }
      }
    });

    tr.querySelector(".btn-del-m").addEventListener("click", () => {
      if (!confirm(`Hapus kode barang ${item.kd_brg} (${item.ur_sskel}) dari daftar master?`)) return;
      activeMasterList.splice(originalIdx, 1);
      saveActiveMasterList();
    });

    masterBody.appendChild(tr);
  });
}

function reclassifyAllExtractedRows() {
  if (extractedRows.length === 0) return;
  extractedRows.forEach((row) => {
    const cls = cvEngine.classifyItem(row.nama, activeMasterList, filterBpsCheck.checked);
    row.kd_brg = cls.kd_brg;
    row.ur_sskel = cls.ur_sskel;
    row.kd_akun = cls.kd_akun;
    row.score = cls.score;
  });
  renderResultTable();
}

initMasterReference();

dropZone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => {
  if (e.target.files && e.target.files[0]) loadImageFile(e.target.files[0]);
});

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    loadImageFile(e.dataTransfer.files[0]);
  }
});

window.addEventListener("paste", (e) => {
  const items = e.clipboardData?.items || [];
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) loadImageFile(file);
      break;
    }
  }
});

threshSlider.addEventListener("input", () => (threshVal.textContent = threshSlider.value));
kernelSlider.addEventListener("input", () => (kernelVal.textContent = kernelSlider.value));
btnReprocess.addEventListener("click", () => {
  if (currentImage) processNotaImage(currentImage);
});

filterBpsCheck.addEventListener("change", () => {
  reclassifyAllExtractedRows();
});

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeView = btn.dataset.view;
    renderCanvasView();
  });
});

function renderCanvasView() {
  if (!currentImage) return;
  let src = overlayCanvas;
  if (activeView === "binary") src = binaryCanvas;
  if (activeView === "original") src = originalCanvas;

  previewCanvas.width = src.width;
  previewCanvas.height = src.height;
  previewCanvas.getContext("2d").drawImage(src, 0, 0);
  previewCanvas.style.display = "block";
  emptyCanvasHint.style.display = "none";
}

function loadImageFile(file) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      currentImage = img;
      btnReprocess.disabled = false;
      processNotaImage(img);
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function setProgress(pct, label) {
  progressBox.style.display = "flex";
  progressPct.textContent = `${Math.round(pct)}%`;
  progressLabel.textContent = label;
  progressFill.style.width = `${pct}%`;
}

function parseCurrency(str) {
  if (!str) return 0;
  let normalized = String(str).replace(/Rp\.?/gi, "").replace(/[oO]/g, "0").trim();
  normalized = normalized.replace(/[.,]\d{2}$/, "");
  const digits = normalized.replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

function extractQuantityFromText(text) {
  const multMatch = text.match(/(?:^|\s)[×xX*]\s*(\d{1,4})\b/);
  if (multMatch) {
    return { qtyNum: parseInt(multMatch[1], 10) || 1, label: `${multMatch[1]} PCS` };
  }
  const unitMatch = text.match(/\b(\d{1,4})\s*(pcs|btl|botol|box|dus|pack|pak|rim|unit|bh|buah|set|lusin|roll|lembar|lbr)\b/i);
  if (unitMatch) {
    return { qtyNum: parseInt(unitMatch[1], 10) || 1, label: `${unitMatch[1]} ${unitMatch[2].toUpperCase()}` };
  }
  return { qtyNum: 1, label: "1 PCS" };
}

function sanitizeExtractedItemName(rawText) {
  if (!rawText) return "";
  let text = rawText.replace(/\s+/g, " ").trim();

  text = text.replace(/^[-~•*—–]+\s*/, "");
  text = text.replace(/^\d{1,3}\s*[.):\-]\s+/, "");
  text = text.replace(/^\[?[A-Z]{1,6}[-_/]\d{2,12}\]?\s*[-:/]?\s*/i, "");
  text = text.replace(/^\d{5,14}\s*[-:/]?\s+/, "");

  text = text.replace(/(?:@|rp\.?|idr)\s*[\d.,]+(?:\s*(?:x|\*|×)\s*\d+)?(?:\s*=?\s*(?:rp\.?)?\s*[\d.,]+)?/gi, " ");
  text = text.replace(/\b\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2}|,-)?\b/g, " ");
  text = text.replace(/\s*[×xX*]\s*\d{1,4}\b/g, " ");
  text = text.replace(/\b\d+\s*(?:pcs|btl|botol|box|dus|pack|pak|rim|unit|bh|buah|set|lusin|roll|lembar|lbr)\b\s*$/i, " ");

  text = text.replace(/^[\s\-~•—–:;|/.,=*×"']+|[\s\-~•—–:;|/.,=*×"']+$/g, "").replace(/\s+/g, " ").trim();
  return text;
}

function isNoiseOrNonItemLine(text) {
  const s = (text || "").trim();
  if (!s || s.length < 3) return true;

  if (/\b(?:tab|caps|shift|ctrl|alt|enter|space|backspace|npwp|pelanggan|alamat|jl\.|kabupaten|kecamatan|bank|rekening|bri|bni|mandiri|kalsel)\b/i.test(s)) return true;
  if (/q\s*w\s*e\s*r|a\s*s\s*d\s*f|z\s*x\s*c\s*v/i.test(s)) return true;

  if (/^(?:tuan|toko|nota|no\.?\s*nota|po\s*nomor|tanggal|tgl|jumlah|total|sub\s*total|grand\s*total|gran\s*harga|ongkir|tunai|cash|kembali|ppn|diskon|terima\s*kasih|hormat\s*kami|penerima|perhatian|barang\s*yang\s*sudah)\b/i.test(s)) {
    return true;
  }

  if (!/[a-zA-Z]{3,}/.test(s)) return true;

  const tokens = s.split(/\s+/);
  const singleCharTokens = tokens.filter((t) => t.length <= 2).length;
  if (tokens.length >= 4 && singleCharTokens / tokens.length > 0.6) return true;

  return false;
}

// Koneksi ke Server Lokal PaddleOCR
async function tryPaddleOCR(canvasElement) {
  lastPaddleError = "";
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const health = await fetch(`${PADDLE_API_URL}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!health.ok) {
      lastPaddleError = `Server merespons status ${health.status}`;
      return null;
    }

    setProgress(45, "Mengirim gambar ke PaddleOCR...");
    const blob = await new Promise((resolve) => canvasElement.toBlob(resolve, "image/png"));
    const formData = new FormData();
    formData.append("file", blob, "nota.png");

    const res = await fetch(`${PADDLE_API_URL}/ocr`, {
      method: "POST",
      body: formData
    });

    if (!res.ok) {
      lastPaddleError = `Endpoint /ocr gagal (${res.status})`;
      return null;
    }
    return await res.json();
  } catch (err) {
    lastPaddleError = err.message || "Tidak dapat terhubung ke http://127.0.0.1:8000";
    return null;
  }
}

async function processNotaImage(img) {
  statusBadge.className = "badge badge-run";
  statusBadge.textContent = "Memproses CV + OCR...";
  setProgress(5, "Menyiapkan kanvas & grayscale...");

  const scale = img.width < 1100 ? 1200 / img.width : 1;
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  [originalCanvas, binaryCanvas, overlayCanvas].forEach((c) => {
    c.width = w;
    c.height = h;
  });

  const origCtx = originalCanvas.getContext("2d");
  origCtx.imageSmoothingEnabled = true;
  origCtx.imageSmoothingQuality = "high";
  origCtx.drawImage(img, 0, 0, w, h);
  const imageData = origCtx.getImageData(0, 0, w, h);

  const thresholdVal = parseInt(threshSlider.value, 10);
  const kernelLen = parseInt(kernelSlider.value, 10);
  const { binInv } = cvEngine.toBinaryInverted(imageData, thresholdVal);

  const binCtx = binaryCanvas.getContext("2d");
  const binImgData = binCtx.createImageData(w, h);
  for (let i = 0; i < binInv.length; i++) {
    const val = binInv[i] === 1 ? 0 : 255;
    binImgData.data[i * 4] = val;
    binImgData.data[i * 4 + 1] = val;
    binImgData.data[i * 4 + 2] = val;
    binImgData.data[i * 4 + 3] = 255;
  }
  binCtx.putImageData(binImgData, 0, 0);

  setProgress(20, "Mendeteksi garis tabel (Morfologi Erosi & Dilasi)...");

  const { cells, tableRowBounds } = cvEngine.detectTableGrid(binInv, w, h, kernelLen, Math.round(kernelLen * 0.45));

  const ovCtx = overlayCanvas.getContext("2d");
  ovCtx.drawImage(originalCanvas, 0, 0);
  ovCtx.lineWidth = 2;

  if (cells.length >= 2) {
    cells.forEach((rowCells, rIdx) => {
      rowCells.forEach((cell) => {
        ovCtx.strokeStyle = rIdx === 0 ? "#ef4444" : "#16a34a";
        ovCtx.strokeRect(cell.x, cell.y, cell.w, cell.h);
      });
    });
  } else if (tableRowBounds && tableRowBounds.length >= 3) {
    tableRowBounds.forEach((rb, rIdx) => {
      ovCtx.strokeStyle = rIdx === 0 ? "#ef4444" : "#16a34a";
      ovCtx.strokeRect(10, rb.y1, w - 20, rb.h);
    });
  }

  renderCanvasView();

  // TAHAP UTAMA: Coba gunakan server lokal PaddleOCR terlebih dahulu
  setProgress(35, "Menghubungkan ke server PaddleOCR...");
  const paddleData = await tryPaddleOCR(originalCanvas);

  if (paddleData && paddleData.status === "success") {
    setProgress(75, "Memetakan hasil PaddleOCR ke Master BMN...");
    let rawLog = ["=== MESIN OCR: PADDLEOCR (AKTIF) ===\n" + paddleData.text];
    parseHeaderMetadata(paddleData.text);

    extractedRows = [];
    parseSpatialMultiLineItems({ words: paddleData.words }, w, h, rawLog);

    rawTextOutput.textContent = rawLog.join("\n");
    renderResultTable();

    setProgress(100, "Selesai (PaddleOCR)!");
    statusBadge.className = "badge badge-done";
    statusBadge.textContent = `Selesai via PaddleOCR (${extractedRows.length} item)`;
    btnExportCsv.disabled = extractedRows.length === 0;
    return;
  }

  // CADANGAN (FALLBACK): Gunakan Tesseract.js jika server PaddleOCR tidak dijalankan
  setProgress(35, "Memuat mesin cadangan Tesseract OCR...");

  try {
    const isChromeExtension = typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL;
    const resolveAssetPath = (relPath) =>
      isChromeExtension ? chrome.runtime.getURL(relPath) : `./${relPath}`;

    const worker = await Tesseract.createWorker("ind+eng", 1, {
      workerPath: resolveAssetPath("lib/worker.min.js"),
      corePath: resolveAssetPath("lib/tesseract-core.wasm.js"),
      langPath: resolveAssetPath("lib/lang"),
      workerBlobURL: false,
      gzip: true
    });

    let rawLog = [];
    if (lastPaddleError) {
      rawLog.push(`⚠️ Info PaddleOCR: ${lastPaddleError} (Beralih ke Tesseract.js)\n`);
    }

    setProgress(45, "Membaca header nota (Toko, Tanggal, Nomor)...");
    const headerCanvas = document.createElement("canvas");
    headerCanvas.width = w;
    headerCanvas.height = Math.round(h * 0.24);
    headerCanvas.getContext("2d").drawImage(originalCanvas, 0, 0, w, headerCanvas.height, 0, 0, w, headerCanvas.height);
    const headerRes = await worker.recognize(headerCanvas.toDataURL("image/png"));
    parseHeaderMetadata(headerRes.data.text);
    rawLog.push("=== HEADER NOTA ===\n" + headerRes.data.text.trim());

    extractedRows = [];

    if (cells.length >= 2) {
      rawLog.push(`\n=== DETEKSI TABEL PENUH: ${cells.length} BARIS x ${cells[0].length} KOLOM ===`);
      const totalRows = cells.length;

      for (let r = 0; r < totalRows; r++) {
        const pct = 50 + ((r + 1) / totalRows) * 45;
        setProgress(pct, `Membaca baris tabel ke-${r + 1} dari ${totalRows}...`);

        const rowCells = cells[r];
        const cellTexts = [];

        for (let c = 0; c < rowCells.length; c++) {
          const cellDataUrl = cvEngine.extractCellDataURL(originalCanvas, rowCells[c], 2.4);
          const res = await worker.recognize(cellDataUrl);
          const cleaned = res.data.text.replace(/\s+/g, " ").trim();
          cellTexts.push(cleaned);
        }

        rawLog.push(`Baris ${r + 1}: [ ${cellTexts.join(" | ")} ]`);

        const col0 = cellTexts[0] || "";
        const col1 = cellTexts[1] || "";
        if (/^(no|nomor)$/i.test(col0) || /nama\s*barang|uraian\s*barang/i.test(col1)) continue;
        if (/^(jumlah|total|grand\s*total|gran\s*harga|ongkir)/i.test(col0) ||
            /^(jumlah|total|grand\s*total|gran\s*harga|ongkir)/i.test(col1)) continue;

        const namaBersih = sanitizeExtractedItemName(col1);
        if (!namaBersih || namaBersih.length < 2) continue;

        const noUrut = col0.replace(/[^\d]/g, "") || String(extractedRows.length + 1);
        const banyak = cellTexts[2] || "1 PCS";
        const harga = parseCurrency(cellTexts[3] || "0");
        const total = parseCurrency(cellTexts[4] || "0") || harga;

        const cls = cvEngine.classifyItem(namaBersih, activeMasterList, filterBpsCheck.checked);
        rawLog.push(`   -> Nama Bersih: "${namaBersih}" => Kode BMN: ${cls.kd_brg} (${cls.ur_sskel}) [${cls.score}%]`);

        extractedRows.push({
          no: noUrut,
          nama: namaBersih,
          banyak: banyak,
          harga: harga,
          total: total,
          kd_brg: cls.kd_brg,
          ur_sskel: cls.ur_sskel,
          kd_akun: cls.kd_akun,
          score: cls.score
        });
      }
    } else if (tableRowBounds && tableRowBounds.length >= 3) {
      rawLog.push(`\n=== DETEKSI BARIS HORIZONTAL TABEL: ${tableRowBounds.length} BARIS ===`);
      const totalRows = tableRowBounds.length;

      for (let r = 0; r < totalRows; r++) {
        const pct = 50 + ((r + 1) / totalRows) * 45;
        setProgress(pct, `Membaca baris nota ke-${r + 1} dari ${totalRows}...`);

        const rb = tableRowBounds[r];
        const rowCell = { x: 8, y: rb.y1, w: w - 16, h: rb.h };
        const rowDataUrl = cvEngine.extractCellDataURL(originalCanvas, rowCell, 2.4);
        const res = await worker.recognize(rowDataUrl);
        const lineText = res.data.text.replace(/\s+/g, " ").trim();

        rawLog.push(`Baris ${r + 1}: "${lineText}"`);

        if (/nama\s*barang|uraian\s*barang/i.test(lineText)) continue;
        if (/^(jumlah|total|grand\s*total|gran\s*harga|ongkir)/i.test(lineText)) continue;

        const priceMatches = [...lineText.matchAll(/(?:Rp\.?\s*)?(\d{1,3}(?:[.,]\d{3})+)/gi)];
        const prices = priceMatches.map((m) => parseCurrency(m[1])).filter((n) => n >= 500);
        const { qtyNum, label: banyak } = extractQuantityFromText(lineText);
        const namaBersih = sanitizeExtractedItemName(lineText);

        if (isNoiseOrNonItemLine(namaBersih)) continue;

        let harga = prices.length > 0 ? prices[0] : 0;
        let total = prices.length > 1 ? prices[prices.length - 1] : harga;
        if (prices.length === 1 && qtyNum > 1) {
          total = prices[0];
          harga = Math.round(total / qtyNum);
        }

        const cls = cvEngine.classifyItem(namaBersih, activeMasterList, filterBpsCheck.checked);
        rawLog.push(`   -> Nama Bersih: "${namaBersih}" | Qty: ${banyak} => Kode BMN: ${cls.kd_brg} (${cls.ur_sskel}) [${cls.score}%]`);

        extractedRows.push({
          no: String(extractedRows.length + 1),
          nama: namaBersih,
          banyak: banyak,
          harga: harga,
          total: total,
          kd_brg: cls.kd_brg,
          ur_sskel: cls.ur_sskel,
          kd_akun: cls.kd_akun,
          score: cls.score
        });
      }
    } else {
      setProgress(65, "Nota tanpa garis tabel — menganalisis item multi-baris...");
      const fullRes = await worker.recognize(originalCanvas.toDataURL("image/png"));
      rawLog.push("\n=== MODE STRUK / NON-TABEL ===\n" + fullRes.data.text);
      parseSpatialMultiLineItems(fullRes.data, w, h, rawLog);
    }

    await worker.terminate();

    rawTextOutput.textContent = rawLog.join("\n");
    renderResultTable();

    setProgress(100, "Selesai!");
    statusBadge.className = "badge badge-done";
    statusBadge.textContent = `Selesai (${extractedRows.length} item)`;
    btnExportCsv.disabled = extractedRows.length === 0;
    btnCopyTxt.disabled = extractedRows.length === 0;
    if (typeof btnCopyTxt !== "undefined") btnCopyTxt.disabled = extractedRows.length === 0;
  } catch (err) {
    console.error(err);
    statusBadge.className = "badge badge-idle";
    statusBadge.textContent = "Error OCR";
    rawTextOutput.textContent = "Terjadi kesalahan saat memproses OCR:\n" + (err?.message || JSON.stringify(err) || String(err));
  }
}

function parseHeaderMetadata(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length > 0) {
    document.getElementById("metaToko").value = lines[0].replace(/[^a-zA-Z0-9\s.&-]/g, "").trim();
  }
  const tglMatch = text.match(/(\d{1,2}\s+(?:JANUARI|FEBRUARI|MARET|APRIL|MEI|JUNI|JULI|AGUSTUS|SEPTEMBER|OKTOBER|NOVEMBER|DESEMBER|\d{1,2})\s+\d{2,4})/i);
  if (tglMatch) document.getElementById("metaTanggal").value = tglMatch[1];

  const notaMatch = text.match(/NOTA\s*(?:Nomor|No)?\s*[:.]*\s*([A-Z0-9\-\/]+)/i);
  if (notaMatch) document.getElementById("metaNomor").value = notaMatch[1];
}

function parseSpatialMultiLineItems(tessData, canvasWidth, canvasHeight, rawLog = []) {
  const words = tessData.words || [];
  if (words.length === 0) return;

  const splitX = canvasWidth * 0.62;
  const leftWords = [];
  const rightWords = [];

  for (const w of words) {
    const txt = (w.text || "").trim();
    if (!txt) continue;
    const centerY = (w.bbox.y0 + w.bbox.y1) / 2;
    if (centerY < canvasHeight * 0.18 || centerY > canvasHeight * 0.82) continue;

    const height = Math.max(10, w.bbox.y1 - w.bbox.y0);
    const wordObj = { text: txt, x0: w.bbox.x0, x1: w.bbox.x1, y: centerY, h: height };

    if (w.bbox.x0 >= splitX) {
      rightWords.push(wordObj);
    } else {
      leftWords.push(wordObj);
    }
  }

  function groupWordsIntoVisualLines(wordList) {
    if (wordList.length === 0) return [];
    const sorted = [...wordList].sort((a, b) => a.y - b.y);
    const lines = [];

    for (const w of sorted) {
      const tolerance = w.h * 0.65;
      let targetLine = lines.find((ln) => Math.abs(ln.y - w.y) <= tolerance);
      if (!targetLine) {
        targetLine = { y: w.y, h: w.h, words: [] };
        lines.push(targetLine);
      }
      targetLine.words.push(w);
      targetLine.y = targetLine.words.reduce((s, item) => s + item.y, 0) / targetLine.words.length;
    }

    return lines
      .sort((a, b) => a.y - b.y)
      .map((ln) => {
        ln.words.sort((a, b) => a.x0 - b.x0);
        return {
          y: ln.y,
          h: ln.h,
          text: ln.words.map((w) => w.text).join(" ")
        };
      });
  }

  const leftLines = groupWordsIntoVisualLines(leftWords);
  const rightLines = groupWordsIntoVisualLines(rightWords);

  const priceAnchors = [];
  for (const rLine of rightLines) {
    const val = parseCurrency(rLine.text);
    if (val >= 500 && /\d/.test(rLine.text)) {
      priceAnchors.push({ y: rLine.y, h: rLine.h, price: val, raw: rLine.text, assignedLeftLines: [] });
    }
  }

  for (const lLine of leftLines) {
    const txt = lLine.text.trim();
    if (isNoiseOrNonItemLine(txt)) continue;

    let chosenAnchor = null;

    for (const anc of priceAnchors) {
      if (Math.abs(lLine.y - anc.y) <= anc.h * 0.85) {
        chosenAnchor = anc;
        break;
      }
    }

    if (!chosenAnchor) {
      for (let i = priceAnchors.length - 1; i >= 0; i--) {
        const anc = priceAnchors[i];
        const nextAnc = priceAnchors[i + 1];
        const isBelowCurrent = lLine.y > anc.y + anc.h * 0.5;
        const isAboveNext = !nextAnc || lLine.y < nextAnc.y - nextAnc.h * 0.85;
        const maxVerticalGap = anc.h * 4.5;

        if (isBelowCurrent && isAboveNext && (lLine.y - anc.y) <= maxVerticalGap) {
          chosenAnchor = anc;
          break;
        }
      }
    }

    if (chosenAnchor) {
      chosenAnchor.assignedLeftLines.push(txt);
    }
  }

  let idx = 1;
  for (const anc of priceAnchors) {
    if (anc.assignedLeftLines.length === 0) continue;

    const combinedRaw = anc.assignedLeftLines.join(" ");
    const { qtyNum, label: banyak } = extractQuantityFromText(combinedRaw);
    const namaBersih = sanitizeExtractedItemName(combinedRaw);

    if (isNoiseOrNonItemLine(namaBersih)) continue;

    const total = anc.price;
    const harga = qtyNum > 1 ? Math.round(total / qtyNum) : total;

    const cls = cvEngine.classifyItem(namaBersih, activeMasterList, filterBpsCheck.checked);
    rawLog.push(
      `Item #${idx}: "${combinedRaw}" + [${anc.raw}]\n` +
      `   -> Nama Bersih: "${namaBersih}" | Qty: ${banyak} | Satuan: ${harga} | Total: ${total}\n` +
      `   -> Kode BMN: ${cls.kd_brg} (${cls.ur_sskel}) [${cls.score}%]`
    );

    extractedRows.push({
      no: String(idx++),
      nama: namaBersih,
      banyak: banyak,
      harga: harga,
      total: total,
      kd_brg: cls.kd_brg,
      ur_sskel: cls.ur_sskel,
      kd_akun: cls.kd_akun,
      score: cls.score
    });
  }
}

function formatRupiah(num) {
  return "Rp " + (num || 0).toLocaleString("id-ID");
}

function renderResultTable() {
  resultBody.innerHTML = "";

  if (extractedRows.length === 0) {
    resultBody.innerHTML = `<tr class="empty-row"><td colspan="9">Belum ada item barang terdeteksi. Coba geser slider Threshold atau klik "+ Tambah Baris Manual".</td></tr>`;
    updateSummary();
    return;
  }

  extractedRows.forEach((row, index) => {
    const tr = document.createElement("tr");
    const scoreClass = row.score >= 80 ? "score-high" : row.score >= 50 ? "score-med" : "score-low";
    const kodeDisplay = row.kd_brg ? `${row.kd_brg} - ${row.ur_sskel}` : "";

    tr.innerHTML = `
      <td>${index + 1}</td>
      <td><input type="text" class="inp-nama" value="${escapeHtml(row.nama)}" /></td>
      <td><input type="text" class="inp-banyak" value="${escapeHtml(row.banyak)}" /></td>
      <td><input type="number" class="num-input inp-harga" value="${row.harga}" /></td>
      <td><input type="number" class="num-input inp-total" value="${row.total}" /></td>
      <td>
        <input type="text" list="bmnDatalist" class="inp-kode" value="${escapeHtml(kodeDisplay)}" placeholder="Ketik nama / kode BMN..." />
      </td>
      <td><strong>${row.kd_akun || "-"}</strong></td>
      <td><span class="score-pill ${scoreClass}">${row.score}%</span></td>
      <td><button class="btn-del" title="Hapus baris">&times;</button></td>
    `;

    tr.querySelector(".inp-nama").addEventListener("change", (e) => {
      row.nama = sanitizeExtractedItemName(e.target.value) || e.target.value.trim();
      const cls = cvEngine.classifyItem(row.nama, activeMasterList, filterBpsCheck.checked);
      row.kd_brg = cls.kd_brg;
      row.ur_sskel = cls.ur_sskel;
      row.kd_akun = cls.kd_akun;
      row.score = cls.score;
      renderResultTable();
    });

    tr.querySelector(".inp-banyak").addEventListener("input", (e) => {
      row.banyak = e.target.value;
    });

    tr.querySelector(".inp-harga").addEventListener("input", (e) => {
      row.harga = parseInt(e.target.value, 10) || 0;
      const qtyNum = parseInt(row.banyak, 10) || 1;
      row.total = row.harga * qtyNum;
      tr.querySelector(".inp-total").value = row.total;
      updateSummary();
    });

    tr.querySelector(".inp-total").addEventListener("input", (e) => {
      row.total = parseInt(e.target.value, 10) || 0;
      updateSummary();
    });

    tr.querySelector(".inp-kode").addEventListener("change", (e) => {
      const val = e.target.value.trim();
      const kd = val.split("-")[0].trim();
      const matched = activeMasterList.find((m) => m.kd_brg === kd);
      if (matched) {
        row.kd_brg = matched.kd_brg;
        row.ur_sskel = matched.ur_sskel;
        row.kd_akun = matched.kd_akun;
        row.score = 100;
        renderResultTable();
      }
    });

    tr.querySelector(".btn-del").addEventListener("click", () => {
      extractedRows.splice(index, 1);
      renderResultTable();
    });

    resultBody.appendChild(tr);
  });

  updateSummary();
}

function updateSummary() {
  const grandTotal = extractedRows.reduce((acc, r) => acc + (r.total || 0), 0);
  document.getElementById("sumItems").textContent = extractedRows.length;
  document.getElementById("sumGrandTotal").textContent = formatRupiah(grandTotal);
  document.getElementById("metaTotal").value = formatRupiah(grandTotal);
  btnExportCsv.disabled = extractedRows.length === 0;
  btnCopyTxt.disabled = extractedRows.length === 0;
}

btnAddRow.addEventListener("click", () => {
  extractedRows.push({
    no: String(extractedRows.length + 1),
    nama: "",
    banyak: "1 PCS",
    harga: 0,
    total: 0,
    kd_brg: "",
    ur_sskel: "",
    kd_akun: "",
    score: 0
  });
  renderResultTable();
});

btnExportCsv.addEventListener("click", () => {
  const toko = document.getElementById("metaToko").value || "-";
  const tgl = document.getElementById("metaTanggal").value || "-";
  const nomor = document.getElementById("metaNomor").value || "-";

  const headers = [
    "No",
    "Toko",
    "Tanggal Nota",
    "Nomor Nota",
    "Nama Barang (Nota)",
    "Banyak",
    "Harga Satuan",
    "Total",
    "Kode Barang (kd_brg)",
    "Uraian Barang (ur_sskel)",
    "Kode Akun (kd_akun)",
    "Akurasi Klasifikasi (%)"
  ];

  const csvLines = [headers.join(";")];
  extractedRows.forEach((r, i) => {
    const line = [
      i + 1,
      `"${toko.replace(/"/g, '""')}"`,
      `"${tgl.replace(/"/g, '""')}"`,
      `"${nomor.replace(/"/g, '""')}"`,
      `"${r.nama.replace(/"/g, '""')}"`,
      `"${r.banyak.replace(/"/g, '""')}"`,
      r.harga,
      r.total,
      `"\t${r.kd_brg}"`,
      `"${r.ur_sskel.replace(/"/g, '""')}"`,
      r.kd_akun,
      r.score
    ];
    csvLines.push(line.join(";"));
  });

  const bom = "\uFEFF";
  const blob = new Blob([bom + csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Klasifikasi_Persediaan_Nota_${nomor.replace(/[^a-zA-Z0-9]/g, "_")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// Fitur Salin Format TXT (2 Kolom: nama barang | kode barang)
const btnCopyTxt = document.createElement("button");
btnCopyTxt.id = "btnCopyTxt";
btnCopyTxt.type = "button";
btnCopyTxt.className = btnExportCsv.className;
btnCopyTxt.textContent = "Salin TXT (Nama | Kode)";
btnCopyTxt.disabled = true;
btnCopyTxt.style.marginLeft = "8px";
btnExportCsv.parentNode.insertBefore(btnCopyTxt, btnExportCsv.nextSibling);

btnCopyTxt.addEventListener("click", async () => {
  if (extractedRows.length === 0) return;

  const lines = ["nama barang | kode barang"];
  extractedRows.forEach((r) => {
    const nama = (r.nama || "-").replace(/\|/g, " ").replace(/\s+/g, " ").trim();
    const kode = (r.kd_brg || "-").trim();
    lines.push(`${nama} | ${kode}`);
  });

  const txtOutput = lines.join("\n");

  try {
    await navigator.clipboard.writeText(txtOutput);
    const originalLabel = btnCopyTxt.textContent;
    btnCopyTxt.textContent = "Tersalin!";
    setTimeout(() => {
      btnCopyTxt.textContent = originalLabel;
    }, 1800);
  } catch (err) {
    prompt("Salin manual teks di bawah ini (Ctrl + C):", txtOutput);
  }
});
const masterModal = document.getElementById("masterModal");
document.getElementById("btnMasterModal").addEventListener("click", () => {
  masterModal.style.display = "flex";
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
