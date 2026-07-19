import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import {
  erstelleKorrekturversion,
  finalisiereTagesbericht,
  pruefeTagesbericht,
  updateBerichtText,
  updateTagesbericht,
} from "@/lib/actions/tagesberichte";

interface RpcAntwort {
  data: unknown;
  error: { message: string } | null;
}

function createFakeClient({
  status = "entwurf",
  rpcAntworten = {},
}: {
  status?: "entwurf" | "generiert" | "geprueft" | "final" | null;
  rpcAntworten?: Record<string, RpcAntwort>;
}) {
  const rpc = vi.fn((name: string) =>
    Promise.resolve(
      rpcAntworten[name] ?? {
        data: null,
        error: { message: `Keine Testantwort für ${name}` },
      },
    ),
  );

  return {
    from() {
      const query: Record<string, unknown> = {
        select: () => query,
        eq: () => query,
        single: () =>
          Promise.resolve({
            data: status === null ? null : { status },
            error: status === null ? { message: "not found" } : null,
          }),
      };
      return query;
    },
    rpc,
  };
}

const mockedCreateClient = vi.mocked(createClient);

function berichtFormData() {
  const formData = new FormData();
  formData.set("baustelle_id", "123e4567-e89b-12d3-a456-426614174000");
  formData.set("datum", "2026-07-14");
  formData.set("wetter", "Sonnig, 18°C");
  formData.set("stichpunkte", "Fundament betoniert");
  formData.set("personal_json", "[]");
  formData.set("material_json", "[]");
  formData.set("foto_json", "[]");
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Berichtstext-Workflow", () => {
  it("lehnt das Bearbeiten eines finalisierten Berichts ab", async () => {
    mockedCreateClient.mockResolvedValue(
      createFakeClient({
        rpcAntworten: {
          speichere_tagesbericht_text: {
            data: [{ ok: false, neuer_status: "final", fehler: "finalisiert" }],
            error: null,
          },
        },
      }) as never,
    );

    const result = await updateBerichtText(
      "123e4567-e89b-12d3-a456-426614174000",
      "Neuer Text",
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/finalisiert/i);
  });

  it("setzt gespeicherten Text auf den Status generiert", async () => {
    mockedCreateClient.mockResolvedValue(
      createFakeClient({
        rpcAntworten: {
          speichere_tagesbericht_text: {
            data: [{ ok: true, neuer_status: "generiert", fehler: null }],
            error: null,
          },
        },
      }) as never,
    );

    const result = await updateBerichtText(
      "123e4567-e89b-12d3-a456-426614174000",
      "Neuer Text",
    );

    expect(result).toMatchObject({ ok: true, status: "generiert" });
  });

  it("gibt technische RPC-Fehler verständlich zurück", async () => {
    mockedCreateClient.mockResolvedValue(
      createFakeClient({
        rpcAntworten: {
          speichere_tagesbericht_text: {
            data: null,
            error: { message: "boom" },
          },
        },
      }) as never,
    );

    const result = await updateBerichtText(
      "123e4567-e89b-12d3-a456-426614174000",
      "Neuer Text",
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe("Prüfen und Finalisieren", () => {
  it("markiert einen generierten Bericht als geprüft", async () => {
    mockedCreateClient.mockResolvedValue(
      createFakeClient({
        rpcAntworten: {
          pruefe_tagesbericht: {
            data: [{ ok: true, neuer_status: "geprueft", fehler: null }],
            error: null,
          },
        },
      }) as never,
    );

    const result = await pruefeTagesbericht(
      "123e4567-e89b-12d3-a456-426614174000",
    );

    expect(result).toMatchObject({ ok: true, status: "geprueft" });
  });

  it("verweigert Finalisierung ohne Prüfstatus", async () => {
    mockedCreateClient.mockResolvedValue(
      createFakeClient({
        rpcAntworten: {
          finalisiere_tagesbericht: {
            data: [{ ok: false, version: null, fehler: "nicht_geprueft" }],
            error: null,
          },
        },
      }) as never,
    );

    const result = await finalisiereTagesbericht(
      "123e4567-e89b-12d3-a456-426614174000",
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/geprüft/i);
  });

  it("liefert die erzeugte unveränderliche Versionsnummer", async () => {
    mockedCreateClient.mockResolvedValue(
      createFakeClient({
        rpcAntworten: {
          finalisiere_tagesbericht: {
            data: [{ ok: true, version: 2, fehler: null }],
            error: null,
          },
        },
      }) as never,
    );

    const result = await finalisiereTagesbericht(
      "123e4567-e89b-12d3-a456-426614174000",
    );

    expect(result).toMatchObject({ ok: true, status: "final", version: 2 });
  });

  it("fordert bei Korrekturen einen konkreten Grund", async () => {
    mockedCreateClient.mockResolvedValue(
      createFakeClient({
        rpcAntworten: {
          erstelle_tagesbericht_korrektur: {
            data: [{ ok: false, neuer_status: null, fehler: "grund_zu_kurz" }],
            error: null,
          },
        },
      }) as never,
    );

    const result = await erstelleKorrekturversion(
      "123e4567-e89b-12d3-a456-426614174000",
      "x",
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/mindestens fünf/i);
  });
});

describe("Tagesbericht-Eckdaten", () => {
  it("lehnt Änderungen an finalisierten Berichten ab", async () => {
    mockedCreateClient.mockResolvedValue(
      createFakeClient({ status: "final" }) as never,
    );

    const result = await updateTagesbericht(
      "123e4567-e89b-12d3-a456-426614174000",
      {},
      berichtFormData(),
    );

    expect(result.message).toMatch(/finalisiert/i);
  });

  it("weist Personal mit mehr als 24 Stunden zurück", async () => {
    const formData = berichtFormData();
    formData.set(
      "personal_json",
      JSON.stringify([{ name: "M. Mustermann", stunden: 30, taetigkeit: "Montage" }]),
    );

    const result = await updateTagesbericht(
      "123e4567-e89b-12d3-a456-426614174000",
      {},
      formData,
    );

    expect(result.errors?.personal_json?.[0]).toMatch(/ungültige Angaben/i);
    expect(mockedCreateClient).not.toHaveBeenCalled();
  });
});
