import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("voice provider configuration", () => {
  it("uses a configurable active Groq extraction model", () => {
    const files = [
      join(process.cwd(), "modules", "ai", "capture-providers.ts"),
      join(process.cwd(), "modules", "ai", "providers.ts"),
    ];
    const source = files.map((file) => readFileSync(file, "utf8")).join("\n");

    expect(source).toContain("CAPTURE_GROQ_EXTRACTION_MODEL");
    expect(source).toContain("openai/gpt-oss-20b");
    expect(source).not.toContain("llama-3.3-70b-versatile");
  });
});
