import os
# Matikan PIR / oneDNN yang menyebabkan bug ConvertPirAttribute2RuntimeAttribute di Windows
os.environ["FLAGS_enable_pir_api"] = "0"
os.environ["FLAGS_use_mkldnn"] = "0"

import io
import traceback
import numpy as np
from PIL import Image
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from paddleocr import PaddleOCR
import uvicorn

app = FastAPI(title="PaddleOCR Local Bridge untuk Nota BMN")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("Memuat model PaddleOCR (Mode Stabil CPU)...")
try:
    ocr = PaddleOCR(
        use_textline_orientation=True,
        lang="id",
        enable_mkldnn=False,
    )
except Exception:
    ocr = PaddleOCR(
        use_angle_cls=True,
        lang="id",
        enable_mkldnn=False,
    )
print("PaddleOCR siap! Buka browser ke: http://127.0.0.1:8000")

@app.get("/health")
def health_check():
    return JSONResponse(content={"status": "ok", "engine": "PaddleOCR"})

@app.post("/ocr")
async def extract_nota_ocr(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")
        img_np = np.array(image)

        words = []
        full_lines = []

        if hasattr(ocr, "predict"):
            results = ocr.predict(img_np)
            for res in results:
                data = {}
                if isinstance(res, dict):
                    data = res.get("res", res)
                elif hasattr(res, "res") and isinstance(res.res, dict):
                    data = res.res
                elif hasattr(res, "json") and isinstance(res.json, dict):
                    data = res.json.get("res", res.json)
                else:
                    data = {
                        "rec_texts": getattr(res, "rec_texts", []),
                        "rec_scores": getattr(res, "rec_scores", []),
                        "dt_polys": getattr(res, "dt_polys", []),
                    }

                texts = data.get("rec_texts") or []
                scores = data.get("rec_scores") or []
                polys = data.get("dt_polys") or []

                for text, conf, box in zip(texts, scores, polys):
                    box_list = box.tolist() if hasattr(box, "tolist") else box
                    xs = [float(pt[0]) for pt in box_list]
                    ys = [float(pt[1]) for pt in box_list]
                    words.append({
                        "text": str(text),
                        "confidence": round(float(conf), 4),
                        "bbox": {
                            "x0": round(min(xs), 2),
                            "y0": round(min(ys), 2),
                            "x1": round(max(xs), 2),
                            "y1": round(max(ys), 2),
                        },
                    })
                    full_lines.append(str(text))
        else:
            result = ocr.ocr(img_np)
            if result and result[0]:
                for line in result[0]:
                    box = line[0]
                    text, conf = line[1]
                    xs = [float(pt[0]) for pt in box]
                    ys = [float(pt[1]) for pt in box]
                    words.append({
                        "text": str(text),
                        "confidence": round(float(conf), 4),
                        "bbox": {
                            "x0": round(min(xs), 2),
                            "y0": round(min(ys), 2),
                            "x1": round(max(xs), 2),
                            "y1": round(max(ys), 2),
                        },
                    })
                    full_lines.append(str(text))

        return JSONResponse(
            content={
                "status": "success",
                "text": "\n".join(full_lines),
                "words": words,
            }
        )
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": str(e)},
        )

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app.mount("/", StaticFiles(directory=BASE_DIR, html=True), name="static")

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)