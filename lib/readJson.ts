// Surface real server errors (HTML error pages, proxy pages) instead of
// letting res.json() throw "Unexpected token '<'".
export async function readJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    const snippet = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
    throw new Error(
      `Server returned ${res.status} with a non-JSON response${snippet ? `: ${snippet}` : ""}. ` +
        `Check the terminal running \`npm run dev\` for the underlying error.`
    );
  }
}
