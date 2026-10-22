import { clubKey } from "./league-memories";

/**
 * Each club's main colour (the shirt or crest colour the club is known by), used to tint its page. A club not listed
 * gets Fotban's green. These are public brand facts, listed by hand for the clubs the site has pages for.
 */
const table: Record<string, string> = {
  "AFC Bournemouth": "#DA291C", "Arsenal FC": "#EF0107", "Aston Villa FC": "#670E36", "Brentford FC": "#E30613", "Brighton & Hove Albion FC": "#0057B8",
  "Chelsea FC": "#034694", "Coventry City FC": "#59CBE8", "Crystal Palace FC": "#1B458F", "Everton FC": "#003399", "Fulham FC": "#1A1A1A", "Hull City AFC": "#F5A12D",
  "Ipswich Town FC": "#3A64A3", "Leeds United FC": "#FFCD00", "Liverpool FC": "#C8102E", "Manchester City FC": "#6CABDD", "Manchester United FC": "#DA291C",
  "Newcastle United FC": "#241F20", "Nottingham Forest FC": "#DD0000", "Sunderland AFC": "#EB172B", "Tottenham Hotspur FC": "#132257",
  "Deportivo Alavés": "#0761AF", "Athletic Club": "#EE2523", "Club Atlético de Madrid": "#CB3524", "FC Barcelona": "#A50044", "RC Celta de Vigo": "#8AC3EE",
  "RC Deportivo La Coruña": "#0066B3", "Elche CF": "#00A651", "RCD Espanyol de Barcelona": "#007FC8", "Getafe CF": "#005999", "Levante UD": "#B4053F", "Málaga CF": "#0099DD",
  "CA Osasuna": "#D91A21", "Rayo Vallecano de Madrid": "#E53027", "Real Betis Balompié": "#0BB363", "Real Madrid CF": "#FEBE10", "Real Racing Club de Santander": "#00A04A",
  "Real Sociedad de Fútbol": "#0067B1", "Sevilla FC": "#D4021D", "Valencia CF": "#EE7F00",
  "Angers SCO": "#1D1D1B", "AJ Auxerre": "#0056A3", "Le Havre AC": "#5BA1D4", "Le Mans FC": "#D8232A", "FC Lorient": "#F7931D", "Lille OSC": "#E01E13",
  "Olympique Lyonnais": "#1B3B8C", "Olympique de Marseille": "#2FAEE0", "AS Monaco FC": "#E30613", "OGC Nice": "#CF1F27", "Paris FC": "#0A2B5C",
  "Paris Saint-Germain FC": "#004170", "Racing Club de Lens": "#E7B00B", "RC Strasbourg Alsace": "#0075C9", "Stade Rennais FC 1901": "#E13327",
  "Toulouse FC": "#4F2D7F", "ES Troyes AC": "#0057A8", "Stade Brestois 29": "#E30613",
  "Borussia Dortmund": "#FDE100", "Club Brugge KV": "#0B5DB7", "Como 1907": "#0066B3", "FC Bayern München": "#DC052D", "FC Internazionale Milano": "#0068A8",
  "Fenerbahçe SK": "#002D72", "Feyenoord Rotterdam": "#E30613", "Galatasaray SK": "#A90432", "RB Leipzig": "#DD0741", "LASK Linz": "#1A1A1A", "SSC Napoli": "#12A0D7",
  "PAE AEK": "#FFD100", "PSV": "#ED1C24", "FC Porto": "#003893", "FK Shakhtar Donetsk": "#F26B1D", "SK Slavia Praha": "#D2002E", "ŠK Slovan Bratislava": "#0078C8",
  "Sporting Clube de Portugal": "#008A5A", "Sabah FK": "#0B1F4B", "Viking FK": "#004C97", "FK Bodø/Glimt": "#FFD400", "VfB Stuttgart": "#E32219", "AS Roma": "#8E1F2F",
};
const byKey = new Map(Object.entries(table).map(([name, hex]) => [clubKey(name), hex]));
export const defaultClubColor = "#1F5C34";

const channel = (value: number) => { const v = value / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
export const luminance = (hex: string) => { const [r, g, b] = rgb(hex); return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b); };
export const contrast = (a: string, b: string) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const mix = (hex: string, other: string, share: number) => `#${rgb(hex).map((value, index) => Math.round(value * (1 - share) + rgb(other)[index] * share).toString(16).padStart(2, "0")).join("")}`;

export type ClubTheme = { color: string; /** Text and icons placed on the colour: white or near-black, whichever reads better. */ on: string; /** The colour darkened until it reads as text on white (4.5:1). */ ink: string; known: boolean };
export function clubTheme(name: string): ClubTheme {
  const found = byKey.get(clubKey(name));
  const base = found ?? defaultClubColor;
  const on = contrast(base, "#FFFFFF") >= contrast(base, "#111111") ? "#FFFFFF" : "#111111";
  // A mid-tone colour can leave both texts just under 4.5:1; nudge it toward the side the text is not on until it reads.
  let color = base;
  for (let step = 1; contrast(color, on) < 4.5 && step <= 20; step++) color = mix(base, on === "#FFFFFF" ? "#000000" : "#FFFFFF", step * 0.03);
  let ink = color;
  for (let step = 1; contrast(ink, "#FFFFFF") < 4.5 && step <= 20; step++) ink = mix(base, "#000000", step * 0.05);
  return { color, on, ink, known: Boolean(found) };
}
