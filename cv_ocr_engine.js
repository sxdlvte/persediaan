/**
 * Mesin Computer Vision Klasik + Tesseract OCR + Klasifikasi Kode Barang BMN_Persediaan
 * Ditingkatkan untuk garis tabel tipis hasil kompresi WhatsApp/JPEG serta toleransi tinggi.
 */

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
      // Ambang 28% lebar gambar agar garis tipis hasil kompresi WA tetap tertangkap
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

    let bestSynonymCode = null;
    let maxKeywordMatchLen = 0;

    for (const rule of KAMUS_SINONIM_PERSEDIAAN) {
      for (const kw of rule.keywords) {
        const escapedKw = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`(^|\\s)${escapedKw}(\\s|$)`, "i");
        if (regex.test(cleanInput) && kw.length > maxKeywordMatchLen) {
          maxKeywordMatchLen = kw.length;
          bestSynonymCode = rule.kd_brg;
        }
      }
    }

    if (bestSynonymCode) {
      const found = masterList.find((m) => m.kd_brg === bestSynonymCode);
      if (found) {
        return {
          kd_brg: found.kd_brg,
          ur_sskel: found.ur_sskel,
          kd_akun: found.kd_akun,
          score: 95,
          method: "Aturan Sinonim"
        };
      }
    }

    let bestMatch = null;
    let bestScore = 0;

    for (const item of pool) {
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

    const fallback = masterList.find((m) => m.kd_brg === "1010399999") || pool[0];
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