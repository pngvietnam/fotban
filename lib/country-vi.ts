/** Country and nationality names as the provider writes them (English), in Vietnamese; unknown names stay as written. */
const names: Record<string, string> = {
  England: "Anh", Scotland: "Scotland", Wales: "Wales", "Northern Ireland": "Bắc Ireland", Ireland: "Ireland", "Republic of Ireland": "Ireland",
  Spain: "Tây Ban Nha", France: "Pháp", Germany: "Đức", Italy: "Ý", Portugal: "Bồ Đào Nha", Netherlands: "Hà Lan", Belgium: "Bỉ", Switzerland: "Thụy Sĩ", Austria: "Áo",
  Sweden: "Thụy Điển", Norway: "Na Uy", Denmark: "Đan Mạch", Finland: "Phần Lan", Iceland: "Iceland", Poland: "Ba Lan", Czechia: "CH Séc", "Czech Republic": "CH Séc", Slovakia: "Slovakia",
  Hungary: "Hungary", Romania: "Romania", Bulgaria: "Bulgaria", Serbia: "Serbia", Croatia: "Croatia", Slovenia: "Slovenia", "Bosnia-Herzegovina": "Bosnia & Herzegovina", "Bosnia and Herzegovina": "Bosnia & Herzegovina",
  Montenegro: "Montenegro", "North Macedonia": "Bắc Macedonia", Albania: "Albania", Kosovo: "Kosovo", Greece: "Hy Lạp", Turkey: "Thổ Nhĩ Kỳ", Türkiye: "Thổ Nhĩ Kỳ", Ukraine: "Ukraine", Russia: "Nga", Georgia: "Gruzia", Armenia: "Armenia", Israel: "Israel",
  Brazil: "Brazil", Argentina: "Argentina", Uruguay: "Uruguay", Colombia: "Colombia", Chile: "Chile", Paraguay: "Paraguay", Peru: "Peru", Ecuador: "Ecuador", Venezuela: "Venezuela", Bolivia: "Bolivia",
  Mexico: "Mexico", "United States": "Hoa Kỳ", USA: "Hoa Kỳ", Canada: "Canada", Jamaica: "Jamaica", Honduras: "Honduras", "Costa Rica": "Costa Rica", Panama: "Panama", Haiti: "Haiti",
  Morocco: "Maroc", Algeria: "Algeria", Tunisia: "Tunisia", Egypt: "Ai Cập", Senegal: "Senegal", "Ivory Coast": "Bờ Biển Ngà", "Côte d'Ivoire": "Bờ Biển Ngà", Ghana: "Ghana", Nigeria: "Nigeria", Cameroon: "Cameroon", Mali: "Mali",
  "DR Congo": "CHDC Congo", Congo: "Congo", Guinea: "Guinea", "Cape Verde": "Cabo Verde", "Cape Verde Islands": "Cabo Verde", Gambia: "Gambia", "South Africa": "Nam Phi", Zimbabwe: "Zimbabwe", Angola: "Angola", Gabon: "Gabon", Benin: "Benin", Togo: "Togo",
  Japan: "Nhật Bản", "South Korea": "Hàn Quốc", "Korea Republic": "Hàn Quốc", China: "Trung Quốc", Australia: "Úc", "New Zealand": "New Zealand", Iran: "Iran", Iraq: "Iraq", "Saudi Arabia": "Ả Rập Xê Út", Uzbekistan: "Uzbekistan", Qatar: "Qatar", India: "Ấn Độ", Philippines: "Philippines", Indonesia: "Indonesia", Vietnam: "Việt Nam",
  Luxembourg: "Luxembourg", Cyprus: "Síp", Malta: "Malta", Lithuania: "Litva", Latvia: "Latvia", Estonia: "Estonia", Belarus: "Belarus", Moldova: "Moldova", Kazakhstan: "Kazakhstan", Azerbaijan: "Azerbaijan", Curaçao: "Curaçao", Suriname: "Suriname", "Faroe Islands": "Quần đảo Faroe",
  Europe: "Châu Âu", World: "Thế giới",
};
export const countryVi = (name: string | null | undefined) => name ? names[name.trim()] ?? name.trim() : null;
/** "Sweden, Hungary" → "Thụy Điển, Hungary" (the provider may list several nationalities). */
export const nationalityVi = (value: string | null | undefined) => value ? value.split(/\s*,\s*/).map((part) => countryVi(part)).filter(Boolean).join(", ") || null : null;
