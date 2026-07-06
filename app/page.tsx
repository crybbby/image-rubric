"use client";

import { useState, useCallback, useRef } from "react";
import RubricResults from "@/components/RubricResults";
import EnhancePanel from "@/components/EnhancePanel";
import type { RubricResult } from "@/types/rubric";
import { readJson } from "@/lib/readJson";
import { fitImagesToBudget } from "@/lib/imageBudget";

interface UploadedImage {
  file: File;
  preview: string;
  base64: string;
  mediaType: string;
}

export default function Home() {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<RubricResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Downscale in the browser before upload: hosting platforms cap request
  // bodies (Vercel: 4.5MB) and the models don't need more than ~1568px anyway.
  const readAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const processFile = async (file: File): Promise<UploadedImage> => {
    try {
      const bitmap = await createImageBitmap(file);
      const MAX = 1568;
      const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
      const w = Math.round(bitmap.width * scale);
      const h = Math.round(bitmap.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close();
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      return {
        file,
        preview: dataUrl,
        base64: dataUrl.split(",")[1],
        mediaType: "image/jpeg",
      };
    } catch {
      // Fall back to the raw file if the browser can't decode/resize it
      const dataUrl = await readAsDataUrl(file);
      return { file, preview: dataUrl, base64: dataUrl.split(",")[1], mediaType: file.type };
    }
  };

  const processFiles = useCallback(async (files: File[]) => {
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    const valid = files.filter((f) => validTypes.includes(f.type));
    if (valid.length === 0) return;

    const processed = await Promise.all(valid.map(processFile));

    setImages((prev) => [...prev, ...processed]);
    setResult(null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      processFiles(Array.from(e.dataTransfer.files));
    },
    [processFiles]
  );

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setResult(null);
  };

  const reorderImage = (from: number, to: number) => {
    setImages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setResult(null);
  };

  const analyze = async () => {
    if (images.length === 0) return;
    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const payload = await fitImagesToBudget(
        images.map((img) => ({
          base64: img.base64,
          mediaType: img.mediaType,
          name: img.file.name,
        }))
      );

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: payload }),
      });

      const data = await readJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Analysis failed");
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const reset = () => {
    setImages([]);
    setResult(null);
    setError(null);
  };

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Vive Health Image Rubric</h1>
            <p className="text-sm text-gray-500 mt-0.5">Amazon listing image quality review</p>
          </div>
          {(images.length > 0 || result) && (
            <button
              onClick={reset}
              className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2"
            >
              Start over
            </button>
          )}
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Upload zone */}
        {!result && (
          <section>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                isDragging
                  ? "border-blue-400 bg-blue-50"
                  : "border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => processFiles(Array.from(e.target.files ?? []))}
              />
              <div className="text-4xl mb-3">📷</div>
              <p className="text-gray-700 font-medium">Drop your image set here</p>
              <p className="text-sm text-gray-400 mt-1">
                PNG, JPG, WEBP — upload all images in the set at once
              </p>
            </div>

            {images.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-gray-700">
                    {images.length} image{images.length !== 1 ? "s" : ""} — drag to reorder
                  </p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    + Add more
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {images.map((img, i) => (
                    <div
                      key={i}
                      className="relative group rounded-lg overflow-hidden border border-gray-200 bg-white"
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", String(i))}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.stopPropagation();
                        const from = Number(e.dataTransfer.getData("text/plain"));
                        reorderImage(from, i);
                      }}
                    >
                      <div className="aspect-square">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.preview}
                          alt={img.file.name}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="absolute top-1.5 left-1.5 bg-black/60 text-white text-xs rounded px-1.5 py-0.5">
                        {i + 1}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeImage(i);
                        }}
                        className="absolute top-1.5 right-1.5 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ×
                      </button>
                      <div className="px-2 py-1.5 border-t border-gray-100">
                        <p className="text-xs text-gray-500 truncate">{img.file.name}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {error && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    {error}
                  </div>
                )}

                <button
                  onClick={analyze}
                  disabled={isAnalyzing}
                  className="mt-6 w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-xl transition-colors text-sm"
                >
                  {isAnalyzing ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Analyzing image set…
                    </span>
                  ) : (
                    "Run Rubric Analysis"
                  )}
                </button>
              </div>
            )}
          </section>
        )}

        {/* Results */}
        {result && (
          <>
            <RubricResults
              result={result}
              images={images.map((img) => img.preview)}
              onReset={reset}
            />
            <EnhancePanel
              images={images.map((img) => ({
                base64: img.base64,
                mediaType: img.mediaType,
                preview: img.preview,
                name: img.file.name,
              }))}
              rubricResult={result}
            />
          </>
        )}
      </div>
    </main>
  );
}
