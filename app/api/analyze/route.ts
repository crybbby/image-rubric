import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const RUBRIC_SYSTEM_PROMPT = `You are an expert Amazon product listing image consultant specializing in Vive Health brand imagery.

BRAND: Vive Health
BRAND TONE: Supportive, trustworthy, health-solution oriented, inclusive, accessible.
PRODUCT EMPHASIS: Product is central, shown clearly in relatable lifestyle use (home or daily-life settings) highlighting benefit and comfort.

AMAZON IMAGE POLICY (never recommend or allow violations):
- No deceptive before/after imagery
- No unsubstantiated medical claims
- No badges that mimic Amazon UI elements
- No extraneous watermarks or logos
- No tiny text that becomes illegible at mobile sizes (under 15px equivalent)

RUBRIC CRITERIA:
1. HERO IMAGE: Pure white/clean background, product fills 85%+ of frame, no lifestyle clutter on hero
2. LIFESTYLE IMAGES: Product in use in relatable home/daily-life setting, clearly shows benefit or comfort, models reflect inclusive diverse representation
3. INFOGRAPHIC/DETAIL IMAGES: Legible copy at mobile sizes, benefit-driven (outcomes: comfort, mobility, independence, durability), not feature-dumping
4. VISUAL HIERARCHY: Clear focal point → supporting benefit → CTA. No competing focal points. One message per image.
5. MICROCOPY QUALITY: Concise, outcome-oriented phrasing. Avoid jargon. Natural, accessible language.
6. BRAND ALIGNMENT: Matches Vive Health tone (supportive, trustworthy, health-solution oriented, inclusive, accessible)
7. IMAGE SET COMPLETENESS: Does the set tell a full story? Hero → lifestyle → detail/proof → trust element?
8. AMAZON POLICY COMPLIANCE: Check for policy violations

NOTE: These may be MOCK images with designer notes/annotations written on them. Evaluate the underlying image concept and design intent, not the annotation text itself. Ignore watermarks, draft stamps, or sticky-note style annotations — those are working notes for the designer.

Respond in this exact JSON structure:
{
  "overallScore": <0-100>,
  "overallVerdict": "<1-2 sentence summary>",
  "imageAnalysis": [
    {
      "imageIndex": <0-based index>,
      "imageRole": "<hero|lifestyle|infographic|detail|unknown>",
      "strengths": ["<specific positive observation>"],
      "issues": [
        {
          "severity": "<critical|major|minor>",
          "category": "<category name>",
          "description": "<what is wrong>",
          "fix": "<specific actionable fix>"
        }
      ],
      "score": <0-100>
    }
  ],
  "setLevelFeedback": {
    "strengths": ["<set-level positive>"],
    "gaps": ["<missing image type or story gap>"],
    "priorityFixes": ["<most impactful change ranked 1st, 2nd, 3rd>"]
  }
}`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { images } = body as { images: { base64: string; mediaType: string; name: string }[] };

    if (!images || images.length === 0) {
      return NextResponse.json({ error: "No images provided" }, { status: 400 });
    }

    const imageBlocks: Anthropic.ImageBlockParam[] = images.map((img) => ({
      type: "image",
      source: {
        type: "base64",
        media_type: img.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: img.base64,
      },
    }));

    const imageLabels = images.map((img, i) => `Image ${i + 1}: ${img.name}`).join("\n");

    const response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 4096,
      system: RUBRIC_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text: `Please evaluate this Amazon image set for Vive Health.\n\nImages provided:\n${imageLabels}\n\nProvide a thorough rubric evaluation in the specified JSON format. Be specific and actionable — vague feedback is not useful. For each issue, provide a concrete fix the designer can act on immediately.`,
            },
          ],
        },
      ],
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      return NextResponse.json({ error: "No response from model" }, { status: 500 });
    }

    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Could not parse model response" }, { status: 500 });
    }

    const result = JSON.parse(jsonMatch[0]);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Analysis error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
