import { describe, expect, it } from "vitest";
import { pdfText } from "../supabase/functions/send-bus-ticket/pdf-text";

/**
 * The regression this file exists for.
 *
 * `pdf-lib`'s standard Helvetica is WinAnsi, and `drawText` throws on anything
 * outside CP1252. `build_partner_listings` names every route
 * "Origine → Destination", so the arrow made **100%** of ticket PDFs fail with
 * `WinAnsi cannot encode "→" (0x2192)` — and it only surfaced against a real
 * booking, because every fixture until then had an ASCII route name.
 *
 * Anything added to that PDF must pass through this function. These tests
 * exist so that if someone removes it, the reason comes back as a failing
 * test rather than as a silent 500 on every ticket.
 */
describe("pdfText", () => {
  it("replaces the arrow that broke every ticket", () => {
    expect(pdfText("Port-au-Prince → Cap-Haïtien")).toBe("Port-au-Prince - Cap-Haïtien");
  });

  it("handles the other arrows a route name might carry", () => {
    expect(pdfText("A ← B")).toBe("A - B");
    expect(pdfText("A ↔ B")).toBe("A - B");
    expect(pdfText("A ⟶ B")).toBe("A - B");
    expect(pdfText("A ➔ B")).toBe("A - B");
  });

  it("leaves French accents alone — they are all in CP1252", () => {
    expect(pdfText("Gare Portail Saint-Joseph, Pétion-Ville")).toBe(
      "Gare Portail Saint-Joseph, Pétion-Ville",
    );
    expect(pdfText("àâçèéêëîïôùûüÿÀÂÇÈÉÊËÎÏÔÙÛÜ")).toBe("àâçèéêëîïôùûüÿÀÂÇÈÉÊËÎÏÔÙÛÜ");
  });

  it("keeps the CP1252 extras above U+00FF that pdf-lib can still draw", () => {
    expect(pdfText("€")).toBe("€");
    expect(pdfText("« Trajet »")).toBe("« Trajet »");
    expect(pdfText("l’heure")).toBe("l’heure");
    expect(pdfText("Œuvre")).toBe("Œuvre");
    expect(pdfText("2013–2026")).toBe("2013–2026");
  });

  it("turns the space characters that look like spaces into spaces", () => {
    expect(pdfText("12 h")).toBe("12 h");
    expect(pdfText("12 h")).toBe("12 h");
    expect(pdfText("12 h")).toBe("12 h");
  });

  it("drops anything else rather than letting drawText throw", () => {
    // A ticket that prints with one character missing beats one that does not
    // print at all.
    expect(pdfText("Trajet 🚌 direct")).toBe("Trajet  direct");
    expect(pdfText("Автобус")).toBe("");
    expect(pdfText("✓ payé")).toBe(" payé");
  });

  it("survives null and undefined, which a nullable column will supply", () => {
    expect(pdfText(null as unknown as string)).toBe("");
    expect(pdfText(undefined as unknown as string)).toBe("");
  });

  it("emits nothing outside CP1252 for any realistic route name", () => {
    const names = [
      "Port-au-Prince → Cap-Haïtien",
      "Les Cayes → Jérémie",
      "Gonaïves → Môle-Saint-Nicolas",
      "Trajet 🚌 « express » — 2026",
    ];
    for (const name of names) {
      for (const ch of pdfText(name)) {
        const code = ch.codePointAt(0)!;
        const drawable =
          code < 0x100 ||
          // The 27 characters CP1252 adds above U+00FF.
          [0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
           0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
           0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
          ].includes(code);
        expect(drawable, `${ch} (0x${code.toString(16)}) would throw in pdf-lib`).toBe(true);
      }
    }
  });
});
