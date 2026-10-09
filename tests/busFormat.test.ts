import { describe, expect, it } from "vitest";
import { busArrival, busDuration, busTime, citySlug } from "../src/lib/busFormat";

describe("busDuration", () => {
  it("reads whole hours without a stray :00", () => {
    expect(busDuration(360)).toBe("6 h");
    expect(busDuration(60)).toBe("1 h");
  });

  it("pads the minutes, so 1 h 05 never reads as 1 h 5", () => {
    expect(busDuration(65)).toBe("1 h 05");
    expect(busDuration(95)).toBe("1 h 35");
  });

  it("does not invent a duration it was not given", () => {
    expect(busDuration(0)).toBe("0 h");
    expect(busDuration(null)).toBe("0 h");
    expect(busDuration(undefined)).toBe("0 h");
  });
});

describe("busTime", () => {
  it("trims Postgres seconds off a time", () => {
    expect(busTime("06:00:00")).toBe("06:00");
    expect(busTime("23:30:00")).toBe("23:30");
  });

  it("survives a missing value rather than throwing on a card", () => {
    expect(busTime(null)).toBe("");
    expect(busTime(undefined)).toBe("");
  });
});

describe("busArrival", () => {
  it("adds the duration in clock terms", () => {
    expect(busArrival("06:00:00", 360)).toEqual({ label: "12:00", nextDay: false });
    expect(busArrival("06:15:00", 95)).toEqual({ label: "07:50", nextDay: false });
  });

  it("flags the next day instead of silently wrapping", () => {
    // A 23:00 coach running five hours arrives at 04:00 TOMORROW. Showing
    // "04:00" with no marker would read as arriving nineteen hours early.
    expect(busArrival("23:00:00", 300)).toEqual({ label: "04:00", nextDay: true });
  });

  it("treats exactly midnight as the next day", () => {
    expect(busArrival("18:00:00", 360)).toEqual({ label: "00:00", nextDay: true });
  });

  it("holds across a duration longer than a day", () => {
    expect(busArrival("08:00:00", 1500)).toEqual({ label: "09:00", nextDay: true });
  });
});

describe("citySlug", () => {
  // These must agree with the database's `slugify()`, because `/bus/:from/:to`
  // is resolved by matching one against the other. A disagreement 404s the
  // route for every traveller who types the accent.
  const cases: [string, string][] = [
    ["Port-au-Prince", "port-au-prince"],
    ["Cap-Haïtien", "cap-haitien"],
    ["Jacmel", "jacmel"],
    ["Les Cayes", "les-cayes"],
    ["Gonaïves", "gonaives"],
    ["Môle-Saint-Nicolas", "mole-saint-nicolas"],
    ["Pétion-Ville", "petion-ville"],
  ];

  it.each(cases)("folds %s to %s", (city, slug) => {
    expect(citySlug(city)).toBe(slug);
  });

  it("collapses punctuation and never leaves a leading or trailing dash", () => {
    expect(citySlug("  Saint-Marc  ")).toBe("saint-marc");
    expect(citySlug("Anse-à-Veau")).toBe("anse-a-veau");
    expect(citySlug("—Cap—")).toBe("cap");
  });

  it("returns an empty string rather than a dash for nothing", () => {
    expect(citySlug("")).toBe("");
    expect(citySlug("---")).toBe("");
  });
});
