import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ENHANCE_SYSTEM_PROMPT = `You are an expert Amazon listing art director for Vive Health. You have already reviewed an image set against the brand rubric; now you turn that review into a concrete production plan an AI image-editing model will execute.

BRAND: Vive Health — supportive, trustworthy, health-solution oriented, inclusive, accessible. Product central, benefit-led, relatable home/daily-life settings.

FIRST, WORK OUT WHAT SELLS THIS PRODUCT. Study everything available — the product's appearance, any copy or specs visible on the images, the filenames, and the rubric review — and identify the single strongest selling point for this product on Amazon. When the input is weak (placeholders, sparse copy, mock images, no real photography), do not stall on the missing data: use your expertise in the health/mobility category to infer what this product is and what its buyers care most about (e.g. steadiness and confidence for a cane, pressure-sore prevention for a pressure pad, independence for daily-living aids). State it in keySellingPoint, then make every brief build its visual hierarchy and copy around that selling point.

For each uploaded image, decide:
- "edit" — the image has fixable issues. Write ONE self-contained editing instruction.
- "keep" — the image already scores well and needs no changes.

Also propose NEW images (0-3) that fill the story gaps identified in the rubric review (e.g. missing lifestyle, size/fit detail, trust element). Each new image references one uploaded image as the product-accuracy reference.

MARKETING CRAFT — every brief must direct a top-1% Amazon listing, not a merely compliant one:
- Sell the outcome, not the object. Headlines are emotional and benefit-first ("Move with confidence", "Sleep through the night"), 4-8 punchy words, "you" language, active verbs. Support with one short proof line, never a spec dump.
- Art direction: premium commercial photography — warm, directional lighting with soft shadows and gentle depth of field; rich color contrast against the Vive teal brand accent; subtle ground shadow/reflection under products. Infographics use color-blocked headline bands, thin-line icons in tinted chips, and generous negative space around one dominant focal point.
- Lifestyle images capture a real emotional moment (relief, pride, independence) — genuine expression, storytelling detail in the scene, product clearly the enabler of the moment.
- The thumb-stopping test: composition and headline must still read and evoke the benefit at 100px thumbnail size. If a brief wouldn't stop a scroller, sharpen it.

RULES FOR EDIT/GENERATION INSTRUCTIONS — the image model sees ONLY the source image and your instruction, nothing else:
1. Be fully self-contained. Never reference "the rubric", "the review", or other images.
2. PRODUCT FIDELITY: when the source shows a real product, its shape, proportions, color, materials, logos, and labels must remain exactly as shown — never invent product features. When the source is only a placeholder, sketch, or abstract mock, instead describe the real product in full photographic detail (based on your inference of what it is) so the model renders a believable, professional product — never reproduce the placeholder look.
3. THE OUTPUT MUST BE A FINISHED, RETAIL-READY AMAZON LISTING IMAGE: photorealistic professional product photography (studio or lifestyle), polished commercial graphic design, print-quality typography. Never a wireframe, draft, sketch, diagram, or mockup aesthetic. Say this explicitly in every instruction.
4. Spell out every piece of on-image text verbatim in the instruction (headline and supporting copy), including placement, and require large, high-contrast, mobile-legible type. Keep copy short, benefit-led, plain language built around the key selling point. Also list that exact copy in the "copy" array.
5. Amazon compliance: hero images get a pure white background (RGB 255,255,255) with the product filling ~85% of the frame and NO text, logos, badges, or props. No fake Amazon badges, no before/after deception, no unsubstantiated medical claims.
6. One message per image, single clear focal point, clean visual hierarchy.
7. Lifestyle scenes: realistic, warm, relatable home or daily-life settings with inclusive representation; product clearly in use showing the benefit.
8. Remove designer annotations, sticky notes, draft stamps, or watermarks present in mock images — they are working notes, not content.

Number images starting at index 0 in the order provided.`;

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    planSummary: {
      type: "string",
      description: "2-3 sentence overview of the improvement strategy for this set",
    },
    keySellingPoint: {
      type: "string",
      description:
        "The single strongest selling point for this product on Amazon, inferred from the images/copy (or from category expertise when the input is weak). One sentence.",
    },
    imageEnhancements: {
      type: "array",
      description: "One entry per uploaded image, in order",
      items: {
        type: "object",
        properties: {
          imageIndex: { type: "integer" },
          action: { type: "string", enum: ["edit", "keep"] },
          imageRole: {
            type: "string",
            enum: ["hero", "lifestyle", "infographic", "detail", "unknown"],
          },
          goal: {
            type: "string",
            description: "One sentence: what the revised image achieves",
          },
          issuesAddressed: {
            type: "array",
            items: { type: "string" },
            description: "Rubric issues this edit fixes (empty when action is keep)",
          },
          editInstruction: {
            type: "string",
            description:
              "Complete, self-contained instruction for the image-editing model (empty when action is keep)",
          },
          copy: {
            type: "array",
            items: { type: "string" },
            description: "Exact text that should appear on the image, verbatim (empty if none)",
          },
        },
        required: [
          "imageIndex",
          "action",
          "imageRole",
          "goal",
          "issuesAddressed",
          "editInstruction",
          "copy",
        ],
        additionalProperties: false,
      },
    },
    newImages: {
      type: "array",
      description: "New images to fill story gaps (0-3 entries)",
      items: {
        type: "object",
        properties: {
          imageRole: {
            type: "string",
            enum: ["hero", "lifestyle", "infographic", "detail", "unknown"],
          },
          purpose: { type: "string", description: "The story gap this image fills" },
          referenceImageIndex: {
            type: "integer",
            description:
              "Index of the uploaded image that best shows the product, used as the fidelity reference",
          },
          generationPrompt: {
            type: "string",
            description: "Complete, self-contained instruction for the image model",
          },
          copy: {
            type: "array",
            items: { type: "string" },
            description: "Exact text that should appear on the image (empty if none)",
          },
        },
        required: ["imageRole", "purpose", "referenceImageIndex", "generationPrompt", "copy"],
        additionalProperties: false,
      },
    },
  },
  required: ["planSummary", "keySellingPoint", "imageEnhancements", "newImages"],
  additionalProperties: false,
} as const;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { images, rubricResult } = body as {
      images: { base64: string; mediaType: string; name: string }[];
      rubricResult: unknown;
    };

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

    const imageLabels = images.map((img, i) => `Image ${i} (index ${i}): ${img.name}`).join("\n");

    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 16000,
      system: ENHANCE_SYSTEM_PROMPT,
      output_config: {
        format: {
          type: "json_schema",
          schema: PLAN_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            {
              type: "text",
              text: `Here is the image set for a Vive Health Amazon listing.\n\nImages provided (0-indexed):\n${imageLabels}\n\nRubric review of this set:\n${JSON.stringify(rubricResult, null, 2)}\n\nBuild the improvement plan. Remember: each editInstruction and generationPrompt must stand completely on its own, lock product fidelity to the source image, and spell out all on-image copy verbatim.`,
            },
          ],
        },
      ],
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent || textContent.type !== "text") {
      return NextResponse.json({ error: "No response from model" }, { status: 500 });
    }

    const plan = JSON.parse(textContent.text);
    return NextResponse.json({
      ...plan,
      generationAvailable: Boolean(process.env.GEMINI_API_KEY),
    });
  } catch (err) {
    console.error("Enhance error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
