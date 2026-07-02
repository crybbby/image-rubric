"use client";

import { useRef, useState } from "react";
import type { RubricResult } from "@/types/rubric";
import type {
  EnhanceResponse,
  GeneratedImage,
  GenerationStatus,
} from "@/types/enhance";

export interface SourceImage {
  base64: string;
  mediaType: string;
  preview: string;
  name: string;
}

interface Props {
  images: SourceImage[];
  rubricResult: RubricResult;
}

interface WorkItem {
  key: string;
  label: string;
  role: string;
  kind: "edit" | "keep" | "new";
  goal: string;
  prompt: string;
  copy: string[];
  issuesAddressed: string[];
  sourceIndex: number;
  status: GenerationStatus;
  result: GeneratedImage | null;
  error: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  hero: "Hero",
  lifestyle: "Lifestyle",
  infographic: "Infographic",
  detail: "Detail",
  unknown: "General",
};

function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function downloadImage(item: WorkItem, index: number) {
  if (!item.result) return;
  const ext = item.result.mediaType.split("/")[1] ?? "png";
  const a = document.createElement("a");
  a.href = `data:${item.result.mediaType};base64,${item.result.base64}`;
  a.download = `${String(index + 1).padStart(2, "0")}-${slug(item.role)}-${slug(item.label)}.${ext}`;
  a.click();
}

export default function EnhancePanel({ images, rubricResult }: Props) {
  const [phase, setPhase] = useState<"idle" | "planning" | "ready">("idle");
  const [plan, setPlan] = useState<EnhanceResponse | null>(null);
  const [items, setItems] = useState<WorkItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [productLock, setProductLock] = useState<
    "idle" | "extracting" | "done" | "failed"
  >("idle");
  const [productImage, setProductImage] = useState<GeneratedImage | null>(null);
  const runningRef = useRef(false);
  const productImageRef = useRef<GeneratedImage | null>(null);

  const updateItem = (key: string, patch: Partial<WorkItem>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  };

  const generateItem = async (item: WorkItem) => {
    // Compose from the extracted product reference so the model never sees
    // the old design; fall back to the original image if extraction failed.
    const lock = productImageRef.current;
    const source = lock ?? images[item.sourceIndex];
    if (!source) {
      updateItem(item.key, { status: "error", error: "Source image not found" });
      return;
    }
    updateItem(item.key, { status: "generating", error: null });
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: item.prompt,
          sourceImage: { base64: source.base64, mediaType: source.mediaType },
          quality: item.copy.length > 0 ? "pro" : "standard",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      updateItem(item.key, { status: "done", result: data.image });
    } catch (err) {
      updateItem(item.key, {
        status: "error",
        error: err instanceof Error ? err.message : "Generation failed",
      });
    }
  };

  const runGeneration = async (workItems: WorkItem[], productReferenceIndex: number) => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      // Stage 1: lock a clean product reference out of the best source image.
      setProductLock("extracting");
      const refSource = images[productReferenceIndex] ?? images[0];
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "extract",
            sourceImage: { base64: refSource.base64, mediaType: refSource.mediaType },
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Extraction failed");
        productImageRef.current = data.image;
        setProductImage(data.image);
        setProductLock("done");
      } catch {
        productImageRef.current = null;
        setProductLock("failed");
      }

      // Stage 2: compose every image fresh from the product reference.
      for (const item of workItems) {
        if (item.kind === "keep") continue;
        await generateItem(item);
      }
    } finally {
      runningRef.current = false;
    }
  };

  const buildPlan = async () => {
    setPhase("planning");
    setError(null);
    try {
      const res = await fetch("/api/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: images.map((img) => ({
            base64: img.base64,
            mediaType: img.mediaType,
            name: img.name,
          })),
          rubricResult,
        }),
      });
      const data: EnhanceResponse & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not build the enhancement plan");

      const workItems: WorkItem[] = [
        ...data.imageEnhancements.map((e): WorkItem => {
          const kept = e.action === "keep";
          return {
            key: `edit-${e.imageIndex}`,
            label: `Image ${e.imageIndex + 1}`,
            role: ROLE_LABELS[e.imageRole] ?? e.imageRole,
            kind: kept ? "keep" : "edit",
            goal: e.goal,
            prompt: e.editInstruction,
            copy: e.copy,
            issuesAddressed: e.issuesAddressed,
            sourceIndex: e.imageIndex,
            status: kept ? "kept" : "pending",
            result: kept
              ? {
                  base64: images[e.imageIndex]?.base64 ?? "",
                  mediaType: images[e.imageIndex]?.mediaType ?? "image/png",
                }
              : null,
            error: null,
          };
        }),
        ...data.newImages.map(
          (n, i): WorkItem => ({
            key: `new-${i}`,
            label: `New image ${i + 1}`,
            role: ROLE_LABELS[n.imageRole] ?? n.imageRole,
            kind: "new",
            goal: n.purpose,
            prompt: n.generationPrompt,
            copy: n.copy,
            issuesAddressed: [],
            sourceIndex: n.referenceImageIndex,
            status: "pending",
            result: null,
            error: null,
          })
        ),
      ];

      setPlan(data);
      setItems(workItems);
      setPhase("ready");

      if (data.generationAvailable) {
        runGeneration(workItems, data.productReferenceIndex ?? 0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("idle");
    }
  };

  const doneItems = items.filter((it) => it.status === "done" || it.status === "kept");
  const downloadAll = () => {
    items.forEach((item, i) => {
      if (item.result) downloadImage(item, i);
    });
  };

  return (
    <section className="border-t border-gray-200 pt-8">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-semibold text-gray-900">Improved Image Set</h2>
        {phase === "ready" && doneItems.length > 0 && (
          <button
            onClick={downloadAll}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            ↓ Download all ({doneItems.length})
          </button>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Turn the rubric findings into a revised, ready-to-upload image set.
      </p>

      {phase === "idle" && (
        <>
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}
          <button
            onClick={buildPlan}
            className="w-full py-3 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-colors text-sm"
          >
            ✨ Generate Improved Image Set
          </button>
        </>
      )}

      {phase === "planning" && (
        <div className="flex items-center justify-center gap-3 py-10 text-gray-600 text-sm">
          <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          Writing the enhancement plan for each image…
        </div>
      )}

      {phase === "ready" && plan && (
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
            <div>
              <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-1">
                Key Selling Point
              </p>
              <p className="text-sm font-medium text-emerald-900">{plan.keySellingPoint}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-1">
                Strategy
              </p>
              <p className="text-sm text-emerald-900">{plan.planSummary}</p>
            </div>
            {productLock !== "idle" && (
              <div>
                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-1">
                  Product Lock
                </p>
                {productLock === "extracting" && (
                  <p className="text-sm text-emerald-900 flex items-center gap-2">
                    <span className="inline-block w-3.5 h-3.5 border-2 border-emerald-300 border-t-emerald-700 rounded-full animate-spin" />
                    Extracting a clean product reference — every image is rebuilt from this…
                  </p>
                )}
                {productLock === "done" && productImage && (
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-lg overflow-hidden border border-emerald-200 bg-white flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`data:${productImage.mediaType};base64,${productImage.base64}`}
                        alt="Product reference"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <p className="text-sm text-emerald-900">
                      Product reference locked — all images are composed fresh around it, never
                      from the old designs.
                    </p>
                  </div>
                )}
                {productLock === "failed" && (
                  <p className="text-sm text-amber-800">
                    Couldn&apos;t extract a clean product shot — composing from the original
                    images instead.
                  </p>
                )}
              </div>
            )}
          </div>

          {!plan.generationAvailable && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
              <p className="font-medium mb-1">Image generation is not configured</p>
              <p>
                Add <code className="bg-amber-100 px-1 rounded">GEMINI_API_KEY</code> to{" "}
                <code className="bg-amber-100 px-1 rounded">.env.local</code> and the plan below
                will render finished images automatically. Until then, each card is a
                designer-ready brief.
              </p>
            </div>
          )}

          <div className="space-y-4">
            {items.map((item, i) => (
              <div
                key={item.key}
                className="bg-white rounded-xl border border-gray-200 p-4"
              >
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900">{item.label}</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    {item.role}
                  </span>
                  {item.kind === "keep" && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                      Kept as-is
                    </span>
                  )}
                  {item.kind === "new" && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                      Fills a gap
                    </span>
                  )}
                  <span className="text-xs text-gray-500">{item.goal}</span>
                </div>

                <div className="flex gap-4 flex-wrap">
                  {/* Before */}
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                      {item.kind === "new" ? "Product reference" : "Before"}
                    </p>
                    <div className="w-40 h-40 rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={images[item.sourceIndex]?.preview}
                        alt=""
                        className="w-full h-full object-contain"
                      />
                    </div>
                  </div>

                  {/* After */}
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                      After
                    </p>
                    <div className="w-40 h-40 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center">
                      {item.status === "kept" && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={images[item.sourceIndex]?.preview}
                          alt=""
                          className="w-full h-full object-contain"
                        />
                      )}
                      {item.status === "done" && item.result && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`data:${item.result.mediaType};base64,${item.result.base64}`}
                          alt=""
                          className="w-full h-full object-contain"
                        />
                      )}
                      {item.status === "generating" && (
                        <span className="inline-block w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                      )}
                      {item.status === "pending" && (
                        <span className="text-xs text-gray-400 px-2 text-center">
                          {plan.generationAvailable ? "Queued…" : "Brief only"}
                        </span>
                      )}
                      {item.status === "error" && (
                        <span className="text-xs text-red-500 px-2 text-center">Failed</span>
                      )}
                    </div>
                    <div className="mt-1.5 flex gap-2">
                      {(item.status === "done" || item.status === "kept") && item.result && (
                        <button
                          onClick={() => downloadImage(item, i)}
                          className="text-xs text-blue-600 hover:text-blue-700"
                        >
                          ↓ Download
                        </button>
                      )}
                      {item.status === "error" && (
                        <button
                          onClick={() => generateItem(item)}
                          className="text-xs text-blue-600 hover:text-blue-700"
                        >
                          ↻ Retry
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Brief */}
                  <div className="flex-1 min-w-[220px] space-y-2">
                    {item.issuesAddressed.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                          Fixes
                        </p>
                        <ul className="space-y-0.5">
                          {item.issuesAddressed.map((issue, j) => (
                            <li key={j} className="text-xs text-gray-600 flex gap-1.5">
                              <span className="text-emerald-500">✓</span>
                              {issue}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {item.copy.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                          On-image copy
                        </p>
                        <ul className="space-y-0.5">
                          {item.copy.map((line, j) => (
                            <li key={j} className="text-xs text-gray-800 font-medium">
                              “{line}”
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {item.prompt && (
                      <details>
                        <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                          Full design brief
                        </summary>
                        <p className="mt-1 text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-lg p-2 border border-gray-100">
                          {item.prompt}
                        </p>
                      </details>
                    )}
                    {item.error && (
                      <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">
                        {item.error}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
