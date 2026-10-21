import { describe, expect, it } from "vitest";
import { parseGuestFollowCookie } from "../services/guest-follows";

const a = "11111111-1111-4111-8111-111111111111", b = "22222222-2222-4222-8222-222222222222";
describe("guest follow cookie", () => {
  it("reads kinds and ids, dropping duplicates and anything malformed", () => {
    expect(parseGuestFollowCookie(`C.${a}|P.${b}|L.${a}|C.${a}|X.${a}|C.not-an-id|C.|`)).toEqual([{ type: "CLUB", entityId: a }, { type: "PLAYER", entityId: b }, { type: "COMPETITION", entityId: a }]);
    expect(parseGuestFollowCookie(undefined)).toEqual([]);
  });
  it("never reads more than 40 entries", () => {
    const many = Array.from({ length: 60 }, (_, index) => `C.${"0".repeat(8)}-0000-4000-8000-${String(index).padStart(12, "0")}`).join("|");
    expect(parseGuestFollowCookie(many)).toHaveLength(40);
  });
});
