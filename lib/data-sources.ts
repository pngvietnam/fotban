import { FOOTBALL_DATA } from "../providers/football-data/config";

// Safe public metadata only; contains no credential or upstream DTO.
export const dataSources: Record<string, { attribution: { text: string; url: string }; capabilities: { events: boolean; advancedStats: boolean; realtime: boolean } }> = {
  [FOOTBALL_DATA.id]: { attribution: FOOTBALL_DATA.attribution, capabilities: { events: false, advancedStats: false, realtime: false } },
};
