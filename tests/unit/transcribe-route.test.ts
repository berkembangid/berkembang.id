import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock("@/modules/ai/providers", () => ({
  processAudioWithAi: vi.fn(),
  processTextWithAi: vi.fn(),
}));

import type { TranscribeRouteDependencies } from "@/app/api/ai/transcribe/route";

let handleTranscribeRequest: typeof import("@/app/api/ai/transcribe/route").handleTranscribeRequest;

beforeAll(async () => {
  ({ handleTranscribeRequest } = await import("@/app/api/ai/transcribe/route"));
});

function dependencies(
  overrides: Partial<TranscribeRouteDependencies> = {},
): TranscribeRouteDependencies {
  return {
    authenticate: async () => ({ id: "user-1" }),
    processText: async () => null,
    processAudio: async () => null,
    maxAudioBytes: 1024,
    ...overrides,
  };
}

async function responseJson(response: Response) {
  return response.json() as Promise<{
    status: string;
    error?: { code: string };
    transactions: unknown[];
  }>;
}

describe("POST /api/ai/transcribe safety boundary", () => {
  it("rejects requests without an authenticated session before processing", async () => {
    const processText = vi.fn();
    const request = new Request("http://localhost/api/ai/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Pemasukan lima puluh ribu" }),
    });

    const response = await handleTranscribeRequest(
      request,
      dependencies({ authenticate: async () => null, processText }),
    );
    const body = await responseJson(response);

    expect(response.status).toBe(401);
    expect(body.error?.code).toBe("UNAUTHENTICATED");
    expect(body.transactions).toEqual([]);
    expect(processText).not.toHaveBeenCalled();
  });

  it("rejects non-audio files", async () => {
    const formData = new FormData();
    formData.set("audio", new File(["plain text"], "note.txt", { type: "text/plain" }));
    const request = new Request("http://localhost/api/ai/transcribe", {
      method: "POST",
      body: formData,
    });

    const response = await handleTranscribeRequest(request, dependencies());
    const body = await responseJson(response);

    expect(response.status).toBe(415);
    expect(body.error?.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(body.transactions).toEqual([]);
  });

  it("rejects audio larger than the configured limit", async () => {
    const formData = new FormData();
    formData.set(
      "audio",
      new File([new Uint8Array(16)], "recording.webm", { type: "audio/webm" }),
    );
    const request = new Request("http://localhost/api/ai/transcribe", {
      method: "POST",
      body: formData,
    });

    const response = await handleTranscribeRequest(
      request,
      dependencies({ maxAudioBytes: 8 }),
    );
    const body = await responseJson(response);

    expect(response.status).toBe(413);
    expect(body.error?.code).toBe("FILE_TOO_LARGE");
    expect(body.transactions).toEqual([]);
  });

  it("returns an honest empty failure when every provider fails", async () => {
    const formData = new FormData();
    formData.set(
      "audio",
      new File([new Uint8Array(8)], "recording.webm", { type: "audio/webm" }),
    );
    const request = new Request("http://localhost/api/ai/transcribe", {
      method: "POST",
      body: formData,
    });

    const response = await handleTranscribeRequest(request, dependencies());
    const body = await responseJson(response);

    expect(response.status).toBe(502);
    expect(body.error?.code).toBe("AI_PROCESSING_FAILED");
    expect(body.transactions).toEqual([]);
  });
});

