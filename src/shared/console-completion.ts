import { GAMERULES } from "./gamerules.js";
import type { ItemInfo } from "./types.js";
export interface Completion {
  label: string;
  value: string;
  start: number;
  end: number;
  description: string;
  kind: "command" | "argument" | "player" | "item" | "history";
}
export interface CompletionContext {
  players: { name: string; uuid: string; online: boolean }[];
  history: string[];
  items: ItemInfo[];
}
const COMMANDS: [string, string][] = [
  ["list", "Spieler online"],
  ["help", "Befehlshilfe anzeigen"],
  ["version", "Serverversion anzeigen"],
  ["tps", "Serverleistung anzeigen"],
  ["mspt", "Serverleistung anzeigen"],
  ["seed", "Welt-Seed anzeigen"],
  ["time", "Uhrzeit"],
  ["weather", "Wetter"],
  ["difficulty", "Schwierigkeit"],
  ["gamemode", "Spielmodus"],
  ["gamerule", "Spielregeln"],
  ["give", "Items geben"],
  ["clear", "Inventar leeren"],
  ["tp", "Teleportieren"],
  ["teleport", "Teleportieren"],
  ["msg", "Private Nachricht"],
  ["tell", "Private Nachricht"],
  ["say", "Chat-Nachricht an alle"],
  ["title", "Titel auf dem Bildschirm"],
  ["effect", "Effekte verwalten"],
  ["experience", "Erfahrung"],
  ["enchant", "Verzauberung hinzufügen"],
  ["kick", "Kicken"],
  ["ban", "Bannen"],
  ["pardon", "Entbannen"],
  ["banlist", "Bann-Liste"],
  ["op", "OP geben"],
  ["deop", "OP entziehen"],
  ["whitelist", "Whitelist verwalten"],
  ["save-all", "Welt speichern"],
  ["stop", "Server stoppen"],
  ["execute", "Befehl im Kontext ausführen"],
  ["data", "NBT-Daten abfragen"],
  ["locate", "Weltstruktur suchen"],
  ["kill", "Entitäten entfernen"],
  ["setworldspawn", "Weltspawn"],
];
function position(input: string, cursor: number) {
  cursor = Math.max(0, Math.min(input.length, cursor));
  let start = cursor,
    end = cursor;
  while (start > 0 && !/\s/.test(input[start - 1]!)) start--;
  while (end < input.length && !/\s/.test(input[end]!)) end++;
  const prefix = input.slice(0, start).trim().replace(/^\/+/, "");
  const parts = prefix ? prefix.split(/\s+/) : [];
  if (!parts.length) start += /^\/+/.exec(input.slice(start))?.[0].length ?? 0;
  return {
    start,
    end,
    parts,
    query: input.slice(start, cursor).toLowerCase(),
    cursor,
  };
}
export function needsItemCompletion(input: string, cursor: number): boolean {
  const { parts } = position(input, cursor);
  return parts[0]?.replace(/^minecraft:/, "") === "give" && parts.length === 2;
}
/** Local hints only. This never sends commands or assumes a server/plugin version. */
export function completeCommand(
  input: string,
  cursor: number,
  context: CompletionContext,
): Completion[] {
  const { start, end, parts, query } = position(input, cursor);
  if (/[\r\n]/.test(input)) return [];
  const result: Completion[] = [];
  const add = (
    value: string,
    description = "",
    kind: Completion["kind"] = "argument",
    label = value,
  ) => {
    if (
      (value.toLowerCase().startsWith(query) ||
        label.toLowerCase().startsWith(query)) &&
      value !== input.slice(start, end)
    )
      result.push({ value, label, description, kind, start, end });
  };
  const values = (options: string[]) => options.forEach((value) => add(value));
  if (!parts.length) {
    if (!query) return [];
    const namespace = query.startsWith("minecraft:") ? "minecraft:" : "";
    for (const [command, description] of COMMANDS)
      add(namespace + command, description, "command");
  } else {
    const root = parts[0]!.replace(/^minecraft:/, "");
    const arg = parts.length;
    if (root === "gamemode" && arg === 1)
      values(["survival", "creative", "adventure", "spectator"]);
    if (root === "difficulty" && arg === 1)
      values(["peaceful", "easy", "normal", "hard"]);
    if (root === "weather" && arg === 1) values(["clear", "rain", "thunder"]);
    if (root === "time" && arg === 1) values(["set", "add", "query"]);
    if (root === "time" && arg === 2 && parts[1] === "set")
      values(["day", "noon", "night", "midnight"]);
    if (root === "time" && arg === 2 && parts[1] === "query")
      values(["daytime", "gametime", "day"]);
    if (root === "gamerule" && arg === 1)
      for (const rule of GAMERULES)
        for (const name of rule.names) add(name, rule.label);
    if (
      root === "gamerule" &&
      arg === 2 &&
      GAMERULES.some(
        (rule) =>
          rule.names.includes(parts[1]!) &&
          !["doFireTick", "playersSleepingPercentage"].includes(rule.key),
      )
    )
      values(["true", "false"]);
    if (root === "whitelist" && arg === 1)
      values(["list", "on", "off", "add", "remove", "reload"]);
    if (root === "banlist" && arg === 1) values(["players", "ips"]);
    if (root === "give" && arg === 2)
      for (const item of context.items) {
        const id = item.id.includes(":") ? item.id : `minecraft:${item.id}`;
        if (
          /^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(id) &&
          (id.startsWith(query) ||
            id.split(":")[1]!.startsWith(query) ||
            item.name.toLowerCase().startsWith(query))
        )
          result.push({
            value: id,
            label: id,
            description: item.name,
            kind: "item",
            start,
            end,
          });
      }
    if (root === "give" && arg === 3) values(["1", "16", "64"]);
    const target =
      (arg === 1 &&
        [
          "give",
          "clear",
          "tp",
          "teleport",
          "msg",
          "tell",
          "kick",
          "title",
          "kill",
          "enchant",
          "experience",
        ].includes(root)) ||
      (arg === 2 && root === "gamemode") ||
      (arg === 2 && ["tp", "teleport"].includes(root));
    const profile =
      (arg === 1 && ["op", "deop", "ban", "pardon"].includes(root)) ||
      (arg === 2 &&
        root === "whitelist" &&
        ["add", "remove"].includes(parts[1]!));
    if (target) {
      add("@a", "Alle Spieler");
      add("@p", "Nächster Spieler");
      add("@r", "Zufälliger Spieler");
    }
    if (target || profile)
      for (const player of context.players) {
        if (target && !player.online) continue;
        const value = profile ? player.name : player.uuid;
        if (
          (profile && /^[a-zA-Z0-9_.-]{1,40}$/.test(value)) ||
          (!profile && /^[a-f0-9-]{36}$/i.test(value))
        )
          add(
            value,
            profile ? "Spieler" : "Spieler-UUID",
            "player",
            player.name,
          );
      }
  }
  if (cursor === input.length && input.trim())
    for (const command of [...context.history].reverse()) {
      if (
        command
          .toLowerCase()
          .startsWith(input.trim().replace(/^\/+/, "").toLowerCase()) &&
        command !== input.trim().replace(/^\/+/, "") &&
        !/[\r\n]/.test(command)
      )
        result.push({
          label: command,
          value: command,
          description: "Verlauf",
          kind: "history",
          start: /^\s*\/*/.exec(input)?.[0].length ?? 0,
          end: input.length,
        });
    }
  const seen = new Set<string>();
  return result
    .filter((item) => {
      const key = applyCompletion(input, item).value.trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}
export function applyCompletion(
  input: string,
  completion: Completion,
): { value: string; cursor: number } {
  const suffix = input.slice(completion.end);
  const space = suffix || completion.kind === "history" ? "" : " ";
  return {
    value: input.slice(0, completion.start) + completion.value + space + suffix,
    cursor: completion.start + completion.value.length + space.length,
  };
}
