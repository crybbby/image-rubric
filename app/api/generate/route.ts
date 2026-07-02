import { NextRequest, NextResponse } from "next/server";
import { readFile, readdir } from "fs/promises";
import path from "path";

const GEMINI_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";
// Text-heavy images (infographics, comparison charts) render far more reliably
// on the pro image model; photo-only edits don't need it.
const GEMINI_PRO_MODEL = process.env.GEMINI_PRO_IMAGE_MODEL || "gemini-3-pro-image";

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

// Gold-standard listing images (style-refs/) sent alongside text-heavy
// generations so the model matches the brand's proven layout language.
let styleRefsCache: { mimeType: string; data: string }[] | null = null;
async function loadStyleRefs() {
  if (styleRefsCache) return styleRefsCache;
  try {
    const dir = path.join(process.cwd(), "style-refs");
    const mime: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
    };
    const files = (await readdir(dir))
      .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
      .sort();
    styleRefsCache = await Promise.all(
      files.map(async (f) => ({
        mimeType: mime[f.split(".").pop()!.toLowerCase()],
        data: (await readFile(path.join(dir, f))).toString("base64"),
      }))
    );
  } catch {
    styleRefsCache = [];
  }
  return styleRefsCache;
}

export async function GET() {
  return NextResponse.json({ enabled: Boolean(process.env.GEMINI_API_KEY) });
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Image generation is not configured. Add GEMINI_API_KEY to .env.local." },
      { status: 400 }
    );
  }

  try {
    const body = await req.json();
    const { prompt, sourceImage, quality } = body as {
      prompt: string;
      sourceImage: { base64: string; mediaType: string };
      quality?: "standard" | "pro";
    };

    if (!prompt || !sourceImage?.base64) {
      return NextResponse.json({ error: "prompt and sourceImage are required" }, { status: 400 });
    }

    const model = quality === "pro" ? GEMINI_PRO_MODEL : GEMINI_MODEL;
    const styleRefs = quality === "pro" ? await loadStyleRefs() : [];

    let finalPrompt = `The FIRST image is the SOURCE. Use it ONLY for product fidelity — the product's exact shape, colors, materials, logos, and labels (and any real photography the brief says to reuse). Do NOT preserve or imitate the source's layout, typography, background, icons, or graphic style: this is a ground-up redesign defined by the brief below. If the result resembles the source's design, it is wrong.`;
    if (styleRefs.length > 0) {
      finalPrompt += ` The ${styleRefs.length} image(s) after it are STYLE REFERENCES — the brand's best-performing Amazon listing images. Match their layout language and craft: bold two-tone headline zone, structured multi-panel grids, circular brand-color icon chips paired with feature names and one-line benefits, real close-up photos inside feature panels, measurement arrows for any size claims, and a solid brand-color benefit band across the bottom with icon + benefit + microcopy columns. Match their information density, typography system, and polish — but NEVER copy their product, their photos, or their text content.`;
    }
    finalPrompt += `

BRIEF:
${prompt}

RENDER QUALITY (mandatory): produce a finished, retail-ready Amazon product listing image with the polish of a top-1% brand — photorealistic professional product photography with warm directional lighting, soft shadows, gentle depth of field, and rich color contrast; polished commercial graphic design with bold, crisp print-quality typography and clear hierarchy. The image must feel premium and emotionally engaging, and still read clearly at thumbnail size. No wireframe, sketch, draft, mockup, or placeholder aesthetic. No watermarks. Square 1:1 canvas.`;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: sourceImage.mediaType,
                    data: sourceImage.base64,
                  },
                },
                ...styleRefs.map((ref) => ({
                  inlineData: { mimeType: ref.mimeType, data: ref.data },
                })),
                { text: finalPrompt },
              ],
            },
          ],
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("Gemini error:", res.status, errText);
      let message = `Image model returned ${res.status}`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed?.error?.message) message = parsed.error.message;
      } catch {
        // keep the generic message
      }
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const data = await res.json();
    const parts: GeminiPart[] = data?.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p) => p.inlineData?.data);

    if (!imagePart?.inlineData) {
      const textPart = parts.find((p) => p.text);
      return NextResponse.json(
        {
          error: textPart?.text
            ? `Model did not return an image: ${textPart.text.slice(0, 300)}`
            : "Model did not return an image",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      image: {
        base64: imagePart.inlineData.data,
        mediaType: imagePart.inlineData.mimeType || "image/png",
      },
    });
  } catch (err) {
    console.error("Generate error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
