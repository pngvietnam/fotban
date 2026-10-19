/** Reviewed Vietnamese-press names for current EPL/La Liga clubs, keyed by football-data.org
 * club ID so they apply to the canonical Club in any environment. Aliases are only appended
 * (operator-added aliases are kept); remove an alias here, then from Club.aliases, to retire it.
 *
 * Deliberately excluded because they are shared with other teams: "Gà trống" (also France),
 * "Đại bàng" (Crystal Palace, Lazio, Benfica, ...), "Villa", "Forest", "The Reds".
 * Upper-case codes such as "MU" match case-sensitively (see providers/ai/rules.ts). */
export const vietnameseClubAliases: Record<string, readonly string[]> = {
  // Premier League
  "57": ["Arsenal", "Pháo thủ", "Gunners"],
  "58": ["Aston Villa"],
  "61": ["Chelsea", "The Blues"],
  "62": ["Everton", "Toffees"],
  "63": ["Fulham"],
  "64": ["Liverpool", "Lữ đoàn đỏ", "The Kop"],
  "65": ["Man City", "Manchester City", "Man xanh", "Citizens"],
  "66": ["MU", "M.U", "Man Utd", "Man United", "Manchester United", "Quỷ đỏ", "Man đỏ", "Red Devils"],
  "67": ["Newcastle", "Chích chòe", "Magpies"],
  "71": ["Sunderland", "Mèo đen", "Black Cats"],
  "73": ["Tottenham", "Spurs"],
  "322": ["Hull City"],
  "341": ["Leeds", "Leeds United"],
  "349": ["Ipswich"],
  "351": ["Nottingham Forest"],
  "354": ["Crystal Palace"],
  "397": ["Brighton", "Mòng biển", "Seagulls"],
  "402": ["Brentford", "Bầy ong"],
  "1044": ["Bournemouth", "Cherries"],
  "1076": ["Coventry"],
  // La Liga
  "77": ["Athletic Bilbao", "Bilbao"],
  "78": ["Atletico", "Atletico Madrid", "Atlético Madrid"],
  "79": ["Osasuna"],
  "80": ["Espanyol"],
  "81": ["Barcelona", "Barca", "Blaugrana"],
  "82": ["Getafe"],
  "84": ["Malaga"],
  "86": ["Real", "Real Madrid", "Kền kền trắng", "Los Blancos", "Los Merengues"],
  "87": ["Rayo"],
  "88": ["Levante"],
  "90": ["Betis"],
  "92": ["Sociedad"],
  "94": ["Villarreal", "Tàu ngầm vàng"],
  "95": ["Valencia", "Bầy dơi"],
  "263": ["Alaves"],
  "285": ["Elche"],
  "558": ["Celta Vigo"],
  "559": ["Sevilla"],
  "560": ["Deportivo La Coruna", "Depor"],
  "5335": ["Racing Santander"],
};
