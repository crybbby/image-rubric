# Vive Health Image Rubric

Upload an Amazon listing image set, get a rubric-based quality review, then generate an improved image set.

## What it does

1. **Analyze** — drop in your current image set. Claude scores it against the Vive Health rubric (hero quality, lifestyle storytelling, infographic legibility, visual hierarchy, brand alignment, set completeness, Amazon policy compliance) and lists specific fixes per image.
2. **Plan** — Claude turns those findings into a production plan: a self-contained edit instruction for each image that needs work, rewritten on-image copy, and specs for new images that fill story gaps (missing lifestyle shot, size/fit detail, trust element).
3. **Generate** — each original image plus its edit instruction goes to Google's Gemini image model, which renders the improved version while keeping the product physically accurate. You get a before/after view and can download the finished set.

If `GEMINI_API_KEY` is not set, steps 1–2 still work and every card doubles as a designer-ready brief.

## Setup

```bash
npm install
cp .env.local.example .env.local   # add your keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Keys

| Env var | Required | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Yes | Rubric analysis + enhancement planning (Claude) |
| `GEMINI_API_KEY` | For image output | Renders the improved images ([Google AI Studio](https://aistudio.google.com/apikey)) |
| `GEMINI_IMAGE_MODEL` | No | Defaults to `gemini-3.1-flash-image` |

## How to use it

1. Upload the full image set for one ASIN (drag to reorder — order matters for the story).
2. Run the rubric analysis and review the scores and priority fixes.
3. Click **Generate Improved Image Set**. Images that already score well are kept as-is; the rest are re-rendered, and gap-filling images are created from your product photos.
4. Download individual images or the whole set, review for product accuracy, and upload to Seller Central.

> Always eyeball generated images before publishing — confirm the product looks exactly right and any claims in the copy are ones you can substantiate.
