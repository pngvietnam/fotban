"use client";
import Link from "next/link";
import { useState } from "react";
import { Mark } from "../ui/crest-mark";

export type SquadCard = { playerId: string; name: string; group: string; nationality: string | null; age: number | null; photoUrl: string | null; href: string };

/** The squad as a grid of players with a filter by line (goalkeepers, defenders, midfielders, forwards). */
export function SquadGrid({ players, groups }: { players: SquadCard[]; groups: string[] }) {
  const [group, setGroup] = useState("Tất cả");
  const shown = group === "Tất cả" ? players : players.filter((player) => player.group === group);
  const filters = ["Tất cả", ...groups];
  return <div className="cb-squad">
    <div className="cb-chips" role="group" aria-label="Lọc theo vị trí">{filters.map((name) => <button type="button" key={name} aria-pressed={group === name} className={group === name ? "active" : ""} onClick={() => setGroup(name)}>{name}<span>{name === "Tất cả" ? players.length : players.filter((player) => player.group === name).length}</span></button>)}</div>
    <ul className="cb-players">{shown.map((player) => <li key={player.playerId}><Link href={player.href}><Mark url={player.photoUrl} name={player.name} size="lg" round photo /><span><b>{player.name}</b><small>{[group === "Tất cả" ? player.group : null, player.nationality, player.age !== null ? `${player.age} tuổi` : null].filter(Boolean).join(" · ")}</small></span></Link></li>)}</ul>
  </div>;
}
