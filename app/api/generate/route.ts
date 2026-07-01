import { NextRequest, NextResponse } from "next/server";

const GEMINI_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
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
    const { prompt, sourceImage } = body as {
      prompt: string;
      sourceImage: { base64: string; mediaType: string };
    };

    if (!prompt || !sourceImage?.base64) {
      return NextResponse.json({ error: "prompt and sourceImage are required" }, { status: 400 });
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
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
                { text: prompt },
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
