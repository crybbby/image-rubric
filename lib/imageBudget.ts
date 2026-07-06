// Hosting platforms cap request bodies (Vercel: 4.5MB). Before sending a
// multi-image payload, shrink each image until the whole set fits a byte
// budget — the more images, the smaller each one gets.

export interface PayloadImage {
  base64: string;
  mediaType: string;
}

const TOTAL_BUDGET_CHARS = 3_200_000; // ~2.4MB binary, leaves headroom for JSON + other fields
const HARD_CEILING_CHARS = 4_200_000;

async function shrink(
  base64: string,
  mediaType: string,
  maxDim: number,
  quality: number
): Promise<string> {
  const img = new Image();
  img.src = `data:${mediaType};base64,${base64}`;
  await img.decode();
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality).split(",")[1];
}

export async function fitImagesToBudget<T extends PayloadImage>(images: T[]): Promise<T[]> {
  const perImage = Math.max(150_000, Math.floor(TOTAL_BUDGET_CHARS / images.length));
  const steps: [number, number][] = [
    [1568, 0.8],
    [1280, 0.7],
    [1024, 0.62],
    [800, 0.55],
  ];

  const fitted = await Promise.all(
    images.map(async (img) => {
      if (img.base64.length <= perImage) return img;
      let best = img.base64;
      let mediaType = img.mediaType;
      for (const [dim, quality] of steps) {
        try {
          const shrunk = await shrink(img.base64, img.mediaType, dim, quality);
          if (shrunk.length < best.length || mediaType !== "image/jpeg") {
            best = shrunk;
            mediaType = "image/jpeg";
          }
          if (best.length <= perImage) break;
        } catch {
          break;
        }
      }
      return { ...img, base64: best, mediaType };
    })
  );

  const total = fitted.reduce((sum, img) => sum + img.base64.length, 0);
  if (total > HARD_CEILING_CHARS) {
    const maxImages = Math.max(1, Math.floor(images.length * (HARD_CEILING_CHARS / total)));
    throw new Error(
      `This set is too large to process in one run — remove some images (about ${maxImages} max per run) and try again.`
    );
  }
  return fitted;
}
