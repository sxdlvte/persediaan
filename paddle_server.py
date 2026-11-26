import io
import numpy as np
from PIL import Image
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
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

print("Memuat model PaddleOCR (pertama kali akan mengunduh model)...")
try:
    # Format parameter PaddleOCR v3.x
    ocr = PaddleOCR(use_textline_orientation=True, lang="id")
except Exception:
    # Fallback jika versi v2.x
    ocr = PaddleOCR(use_angle_cls=True, lang="id")
print("PaddleOCR siap digunakan!")

@app.get("/health")
def health_check():
    return {"status": "ok", "engine": "PaddleOCR"}

@app.post("/ocr")
async def extract_nota_ocr(file: UploadFile = File(...)):
    contents = await file.read()
    image = Image.open(io.BytesIO(contents)).convert("RGB")
    img_np = np.array(image)

    words = []
    full_lines = []

    # Gunakan predict() untuk PaddleOCR v3.x, atau fallback ke ocr() untuk v2.x
    if hasattr(ocr, "predict"):
        results = ocr.predict(img_np)
        for res in results:
            # Ekstrak dari object/dict hasil PaddleOCR v3
            data = res.json["res"] if hasattr(res, "json") and isinstance(res.json, dict) and "res" in res.json else res
            texts = data.get("rec_texts", []) if isinstance(data, dict) else getattr(res, "rec_texts", [])
            scores = data.get("rec_scores", []) if isinstance(data, dict) else getattr(res, "rec_scores", [])
            polys = data.get("dt_polys", []) if isinstance(data, dict) else getattr(res, "dt_polys", [])

            for text, conf, box in zip(texts, scores, polys):
                xs = [float(pt[0]) for pt in box]
                ys = [float(pt[1]) for pt in box]
                words.append({
                    "text": str(text),
                    "confidence": float(conf),
                    "bbox": {
                        "x0": min(xs),
                        "y0": min(ys),
                        "x1": max(xs),
                        "y1": max(ys)
                    }
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
                    "confidence": float(conf),
                    "bbox": {
                        "x0": min(xs),
                        "y0": min(ys),
                        "x1": max(xs),
                        "y1": max(ys)
                    }
                })
                full_lines.append(str(text))

    return {
        "status": "success",
        "text": "\n".join(full_lines),
        "words": words
    }

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)