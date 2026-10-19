import { FOOTBALL_DATA } from "../providers/football-data/config";
import { HIGHLIGHTLY } from "../providers/highlightly/config";

// Safe public metadata only; contains no credential or upstream DTO.
export const dataSources: Record<string, { attribution: { text: string; url: string }; capabilities: { events: boolean; advancedStats: boolean; realtime: boolean } }> = {
  [FOOTBALL_DATA.id]: { attribution: FOOTBALL_DATA.attribution, capabilities: { events: false, advancedStats: false, realtime: false } },
  [HIGHLIGHTLY.id]: { attribution: HIGHLIGHTLY.attribution, capabilities: { events: true, advancedStats: true, realtime: false } },
};
