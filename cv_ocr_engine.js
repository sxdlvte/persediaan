/**
 * Mesin Computer Vision Klasik + Tesseract OCR + Klasifikasi Kode Barang BMN_Persediaan
 * Versi 2.3 (25 Nov 2026): Kamus Merek Retail Prioritas + Kamus SAKTI UC_PER032 + Fuzzy Match
 */
window.CV_ENGINE_VERSION = "v4-MEREK-SAKTI";

// Daftar pemetaan merek dagang & kata kunci inti -> Kode Barang BMN_Persediaan
const KAMUS_MEREK_RETAIL = [
  // 1010305012 - Pengharum Ruangan & Kamper
  { kd_brg: "1010305012", merek: ["stella", "glade", "bayfresh", "dahlia", "bagus kapur", "swallow", "pengharum", "kamper", "kapur barus"] },
  // 1010305002 - Alat Kebersihan Lainnya (Tisu, Kanebo, Pel, Lap)
  { kd_brg: "1010305002", merek: ["tisu", "tissue", "paseo", "jolly", "nice", "montiss", "tessa", "multi", "kanebo", "chamois", "pel lantai", "wiper"] },
  // 1010305005 - Sabun & Bahan Pembersih Dapur
  { kd_brg: "1010305005", merek: ["kunci", "semprotan", "kran"] },
  // 1010305008 - Bahan Kimia Untuk Pembersih (Lantai, Kaca, Toilet, Handwash, Obat Nyamuk)
  { kd_brg: "1010305008", merek: ["sunlight", "mama lemon", "ekonomi", "cuci piring","vixal", "wipol", "super sol", "supersol", "sos lantai", "so klin", "soklin", "cling", "mr muscle", "porstex", "harpic", "dettol", "lifebuoy", "nuvo", "hand wash", "handwash", "cuci tangan", "baygon", "hit spray", "vape"] },
  // 1010305001 - Sapu & Sikat
  { kd_brg: "1010305001", merek: ["sapu", "sikat", "kemoceng"] },
  // 1010305006 - Lakban, Isolasi & Tali
  { kd_brg: "1010305006", merek: ["lakban", "isolasi", "selotip", "nachi", "daimaru", "double tape", "rafia"] },
  // 1010301001 - Alat Tulis (Pulpen, Spidol, Pensil)
  { kd_brg: "1010301001", merek: ["pulpen", "bolpoin", "ballpoint", "spidol", "snowman", "pilot", "standard ae7", "standart", "faster", "kenko gel", "joyko gel", "pensil", "faber castell", "staedtler", "greebel", "stabilo"] },
  // 1010301003 - Penjepit Kertas & Binder Clip
  { kd_brg: "1010301003", merek: ["binder clip", "binder klip", "paper clip", "trigonal clip", "klip kertas"] },
  // 1010301004 - Penghapus & Tip-Ex
  { kd_brg: "1010301004", merek: ["tip ex", "tip-ex", "tipp-ex", "correction tape", "penghapus"] },
  // 1010301006 - Map & Ordner
  { kd_brg: "1010301006", merek: ["ordner", "bantex", "map", "stopmap", "box file", "biola"] },
  // 1010301010 - Lem
  { kd_brg: "1010301010", merek: ["lem", "glukol", "dlukol", "alteco", "altico", "uhus", "uhu"] },
  // 1010301012 - Staples / Stapler
  { kd_brg: "1010301012", merek: ["stapler", "stepler", "hekter", "hd-10", "hd-50"] },
  // 1010301013 - Isi Staples
  { kd_brg: "1010301013", merek: ["isi staples", "isi stepler", "isi hekter"] },
  // 1010302001 - Kertas HVS
  { kd_brg: "1010302001", merek: ["kertas hvs", "kertas a4", "kertas f4", "kertas a3", "sidu", "sinar dunia", "paperone", "paper one", "natural", "bola dunia"] },
  // 1010302002 - Kertas Lainnya / Sticky Notes
  { kd_brg: "1010302002", merek: ["sticky note", "post it", "post-it", "kwitansi", "kuitansi", "buffalo"] },
  // 1010302004 - Amplop
  { kd_brg: "1010302004", merek: ["amplop", "envelope", "merpati", "jaya"] },
  // 1010304004 - Tinta & Toner Printer
  { kd_brg: "1010304004", merek: ["tinta epson", "epson 003", "epson 008", "epson 664", "toner", "cartridge", "catridge", "canon 810", "canon 811", "blueprint", "data print", "e-print"] },
  // 1010306002 - Lampu
  { kd_brg: "1010306002", merek: ["lampu", "philips", "phillips", "hannochs", "bohlam", "bolam"] },
  // 1010306010 - Baterai
  { kd_brg: "1010306010", merek: ["baterai", "batere", "batu jam", "alkaline", "abc", "energizer", "panasonic"] },
  // 1010309001 - Materai
  { kd_brg: "1010309001", merek: ["materai", "meterai"] }
];

class NotaCVEngine {
  constructor() {
    this.worker = null;
  }

  toBinaryInverted(imageData, thresholdVal = 180) {
    const { width, height, data } = imageData;
    const gray = new Uint8Array(width * height);
    const binInv = new Uint8Array(width * height);

    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      gray[p] = g;
      binInv[p] = g < thresholdVal ? 1 : 0;
    }
    return { gray, binInv, width, height };
  }

  morphOpenHorizontal(bin, width, height, kernelLen) {
    const eroded = new Uint8Array(width * height);
    const opened = new Uint8Array(width * height);
    const half = Math.floor(kernelLen / 2);

    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      for (let x = half; x < width - half; x++) {
        let allOne = 1;
        for (let k = -half; k <= half; k++) {
          if (bin[rowOffset + x + k] === 0) {
            allOne = 0;
            break;
          }
        }
        eroded[rowOffset + x] = allOne;
      }
    }

    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      for (let x = half; x < width - half; x++) {
        if (eroded[rowOffset + x] === 1) {
          for (let k = -half; k <= half; k++) {
            opened[rowOffset + x + k] = 1;
          }
        }
      }
    }
    return opened;
  }

  morphOpenVertical(bin, width, height, kernelLen) {
    const eroded = new Uint8Array(width * height);
    const opened = new Uint8Array(width * height);
    const half = Math.floor(kernelLen / 2);

    for (let y = half; y < height - half; y++) {
      for (let x = 0; x < width; x++) {
        let allOne = 1;
        for (let k = -half; k <= half; k++) {
          if (bin[(y + k) * width + x] === 0) {
            allOne = 0;
            break;
          }
        }
        eroded[y * width + x] = allOne;
      }
    }

    for (let y = half; y < height - half; y++) {
      for (let x = 0; x < width; x++) {
        if (eroded[y * width + x] === 1) {
          for (let k = -half; k <= half; k++) {
            opened[(y + k) * width + x] = 1;
          }
        }
      }
    }
    return opened;
  }

  detectTableGrid(binInv, width, height, kernelH = 35, kernelV = 18) {
    const garisH = this.morphOpenHorizontal(binInv, width, height, kernelH);
    const garisV = this.morphOpenVertical(binInv, width, height, kernelV);

    const yLines = [];
    for (let y = 0; y < height; y++) {
      let count = 0;
      const rowOffset = y * width;
      for (let x = 0; x < width; x++) {
        if (garisH[rowOffset + x] === 1) count++;
      }
      if (count > width * 0.28) {
        yLines.push(y);
      }
    }

    const mergedY = this.mergeCloseCoordinates(yLines, 6);

    const tableRowBounds = [];
    for (let i = 0; i < mergedY.length - 1; i++) {
      const y1 = mergedY[i];
      const y2 = mergedY[i + 1];
      const h = y2 - y1;
      if (h >= 12 && h <= 115) {
        tableRowBounds.push({ y1, y2, h });
      }
    }

    let cells = [];
    if (tableRowBounds.length >= 2) {
      const tableTop = tableRowBounds[0].y1;
      const tableBottom = tableRowBounds[tableRowBounds.length - 1].y2;
      const tableHeight = tableBottom - tableTop;

      const xLines = [];
      for (let x = 0; x < width; x++) {
        let count = 0;
        for (let y = tableTop; y <= tableBottom; y++) {
          if (garisV[y * width + x] === 1) count++;
        }
        if (count > tableHeight * 0.25) {
          xLines.push(x);
        }
      }
      const mergedX = this.mergeCloseCoordinates(xLines, 8);

      if (mergedX.length >= 4 && mergedX.length <= 8) {
        for (let r = 0; r < tableRowBounds.length; r++) {
          const { y1, y2, h } = tableRowBounds[r];
          const rowCells = [];
          for (let c = 0; c < mergedX.length - 1; c++) {
            const x1 = mergedX[c];
            const x2 = mergedX[c + 1];
            const w = x2 - x1;
            if (w >= 18) {
              rowCells.push({ row: r, col: c, x: x1, y: y1, w, h });
            }
          }
          if (rowCells.length >= 4) {
            cells.push(rowCells);
          }
        }
      }
    }

    return { garisH, garisV, cells, mergedY, tableRowBounds };
  }

  mergeCloseCoordinates(coords, minGap) {
    if (coords.length === 0) return [];
    const result = [];
    let cluster = [coords[0]];
    for (let i = 1; i < coords.length; i++) {
      if (coords[i] - coords[i - 1] <= minGap) {
        cluster.push(coords[i]);
      } else {
        const avg = Math.round(cluster.reduce((a, b) => a + b, 0) / cluster.length);
        result.push(avg);
        cluster = [coords[i]];
      }
    }
    const avg = Math.round(cluster.reduce((a, b) => a + b, 0) / cluster.length);
    result.push(avg);
    return result;
  }

  extractCellDataURL(sourceCanvas, cell, scale = 2.4) {
    const pad = 2;
    const sx = Math.max(0, cell.x + pad);
    const sy = Math.max(0, cell.y + pad);
    const sw = Math.max(4, cell.w - pad * 2);
    const sh = Math.max(4, cell.h - pad * 2);

    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = Math.round(sw * scale);
    tmpCanvas.height = Math.round(sh * scale);
    const ctx = tmpCanvas.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, tmpCanvas.width, tmpCanvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.filter = "grayscale(100%) contrast(130%)";
    ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, tmpCanvas.width, tmpCanvas.height);

    return tmpCanvas.toDataURL("image/png");
  }

  classifyItem(namaBarang, masterList, prioritizeBps = true) {
    const cleanInput = namaBarang
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleanInput || cleanInput.length < 2) {
      return { kd_brg: "", ur_sskel: "", kd_akun: "", score: 0, method: "Kosong" };
    }

    const pool = prioritizeBps
      ? masterList.filter((m) => m.kd_akun === "117111" || m.kd_akun === "117113")
      : masterList;
    const activePool = pool.length > 0 ? pool : masterList;

    // TAHAP 1: Cek Kamus Merek Retail Prioritas (Stella, Paseo, Sunlight, Vixal, dll.)
    let bestMerekCode = null;
    let bestMerekLen = 0;

    for (const itemMerek of KAMUS_MEREK_RETAIL) {
      for (const m of itemMerek.merek) {
        const cleanM = m.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
        const escaped = cleanM.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`(^|\\s)${escaped}(\\s|$)`, "i");
        if (regex.test(cleanInput) && cleanM.length > bestMerekLen) {
          bestMerekLen = cleanM.length;
          bestMerekCode = itemMerek.kd_brg;
        }
      }
    }

    if (bestMerekCode) {
      const found = masterList.find((m) => String(m.kd_brg).trim() === String(bestMerekCode).trim());
      if (found) {
        return {
          kd_brg: found.kd_brg,
          ur_sskel: found.ur_sskel,
          kd_akun: found.kd_akun,
          score: 98,
          method: "Kamus Merek"
        };
      }
    }

    // TAHAP 2: Cek Kamus Sinonim SAKTI UC_PER032
    const sinonimList = typeof KAMUS_SINONIM_PERSEDIAAN !== "undefined" ? KAMUS_SINONIM_PERSEDIAAN : [];
    let bestSynonymCode = null;
    let bestSynonymScore = 0;

    for (const rule of sinonimList) {
      const targetCode = rule.kd_brg || rule.kode;
      for (const kw of rule.keywords) {
        const cleanKw = kw
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (!cleanKw || cleanKw.length < 3) continue;

        const escapedKw = cleanKw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`(^|\\s)${escapedKw}(\\s|$)`, "i");

        if (regex.test(cleanInput)) {
          const priorityScore = cleanKw.length + 100;
          if (priorityScore > bestSynonymScore) {
            bestSynonymScore = priorityScore;
            bestSynonymCode = targetCode;
          }
        } else if (cleanInput.length >= 6 && cleanKw.includes(cleanInput)) {
          const priorityScore = cleanInput.length + 50;
          if (priorityScore > bestSynonymScore) {
            bestSynonymScore = priorityScore;
            bestSynonymCode = targetCode;
          }
        }
      }
    }

    if (bestSynonymCode) {
      const found = masterList.find((m) => String(m.kd_brg).trim() === String(bestSynonymCode).trim());
      if (found) {
        return {
          kd_brg: found.kd_brg,
          ur_sskel: found.ur_sskel,
          kd_akun: found.kd_akun,
          score: 95,
          method: "Kamus SAKTI"
        };
      }
    }

    // TAHAP 3: Pencocokan Kemiripan Teks (Fuzzy Match) ke Uraian Baku BMN (yang baru diedit)
    let bestMatch = null;
    let bestScore = 0;

    for (const item of activePool) {
      const target = item.ur_sskel.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
      const score = this.computeFuzzyScore(cleanInput, target);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = item;
      }
    }

    if (bestMatch && bestScore >= 40) {
      return {
        kd_brg: bestMatch.kd_brg,
        ur_sskel: bestMatch.ur_sskel,
        kd_akun: bestMatch.kd_akun,
        score: Math.round(bestScore),
        method: "Fuzzy Match"
      };
    }

    // TAHAP 4: Cadangan Default
    const fallback = masterList.find((m) => m.kd_brg === "1010399999") || activePool[0];
    return {
      kd_brg: fallback.kd_brg,
      ur_sskel: fallback.ur_sskel,
      kd_akun: fallback.kd_akun,
      score: Math.round(bestScore),
      method: "Default"
    };
  }

  computeFuzzyScore(s1, s2) {
    if (s1 === s2) return 100;
    const tokens1 = s1.split(/\s+/).filter((t) => t.length > 1);
    const tokens2 = s2.split(/\s+/).filter((t) => t.length > 1);
    if (tokens1.length === 0 || tokens2.length === 0) return 0;

    let matchedTokens = 0;
    for (const t1 of tokens1) {
      for (const t2 of tokens2) {
        if (t1 === t2 || (t1.length >= 4 && t2.includes(t1)) || (t2.length >= 4 && t1.includes(t2))) {
          matchedTokens++;
          break;
        }
      }
    }
    const tokenScore = (matchedTokens / Math.min(tokens1.length, tokens2.length)) * 100;

    const dist = this.levenshtein(s1, s2);
    const maxLen = Math.max(s1.length, s2.length);
    const levScore = ((maxLen - dist) / maxLen) * 100;

    return Math.max(tokenScore * 0.92, levScore);
  }

  levenshtein(a, b) {
    const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        matrix[i][j] =
          b[i - 1] === a[j - 1]
            ? matrix[i - 1][j - 1]
            : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }
    return matrix[b.length][a.length];
  }
}