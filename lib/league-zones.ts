import type { LeagueSlug } from "../types/league-hub";

/** A band of table positions with the same consequence. `tone` picks the colour; the label always goes with it. */
export type TableZone = { from: number; to: number; label: string; tone: "advance" | "playoff" | "out" | "relegation" };

/**
 * Only consequences fixed by the competition's format. European places from the domestic leagues change from
 * season to season (extra places, cup winners), so they are left out rather than guessed.
 */
export const leagueZones: Record<LeagueSlug, TableZone[]> = {
  "champions-league": [
    { from: 1, to: 8, label: "Vào thẳng vòng 1/8", tone: "advance" },
    { from: 9, to: 24, label: "Đá play-off vòng loại trực tiếp", tone: "playoff" },
    { from: 25, to: 36, label: "Bị loại", tone: "out" },
  ],
  "premier-league": [{ from: 18, to: 20, label: "Xuống hạng", tone: "relegation" }],
  "la-liga": [{ from: 18, to: 20, label: "Xuống hạng", tone: "relegation" }],
  "ligue-1": [{ from: 16, to: 16, label: "Đá play-off trụ hạng", tone: "playoff" }, { from: 17, to: 18, label: "Xuống hạng", tone: "relegation" }],
};

export const zoneOf = (zones: TableZone[], position: number) => zones.find((zone) => position >= zone.from && position <= zone.to) ?? null;
