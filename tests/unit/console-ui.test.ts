import { describe, expect, it } from "vitest";
import {
  applyCompletion,
  completeCommand,
  needsItemCompletion,
  type CompletionContext,
} from "../../src/shared/console-completion.js";
import { consoleSegments } from "../../src/shared/console-text.js";
const context: CompletionContext = {
  players: [
    {
      name: "Alex",
      uuid: "36532b5e-c442-3dbb-a24c-c7e55d0f979a",
      online: true,
    },
    {
      name: ".Steve",
      uuid: "00000000-0000-0000-0000-000000000002",
      online: false,
    },
  ],
  history: [
    "plugin:inspect Alex",
    "time set noon",
    "plugin:inspect Alex",
    "bad\nstop",
  ],
  items: [
    { id: "diamond_sword", name: "Diamond Sword" },
    { id: "mod:diamond_wand", name: "Diamond Wand" },
    { id: "unsafe\nstop", name: "Unsafe" },
  ],
};
const complete = (input: string) =>
  completeCommand(input, input.length, context);
describe("local console completion", () => {
  it("completes commands with leading slash, whitespace and vanilla namespaces", () => {
    expect(complete(" /gam").map((item) => item.value)).toEqual([
      "gamemode",
      "gamerule",
    ]);
    const option = complete(" /minecraft:gam")[0]!;
    expect(applyCompletion(" /minecraft:gam", option)).toEqual({
      value: " /minecraft:gamemode ",
      cursor: 21,
    });
    expect(complete("")).toEqual([]);
    expect(complete("stop")).toEqual([]);
  });
  it("offers context-specific arguments and both gamerule naming generations", () => {
    expect(complete("weather r").map((item) => item.value)).toEqual(["rain"]);
    expect(complete("time set n").map((item) => item.value)).toEqual([
      "noon",
      "night",
    ]);
    expect(complete("gamerule keep").map((item) => item.value)).toEqual([
      "keep_inventory",
      "keepInventory",
    ]);
    expect(
      complete("gamerule keep_inventory ").map((item) => item.value),
    ).toEqual(["true", "false"]);
    expect(complete("gamerule fire_spread_radius_around_player ")).toEqual([]);
  });
  it("matches players by name but inserts UUIDs for entity targets", () => {
    const player = complete("gamemode creative Al")[0]!;
    expect(player.label).toBe("Alex");
    expect(player.value).toBe(context.players[0]!.uuid);
    expect(complete("give .St")).toEqual([]);
    expect(complete("ban .St")[0]?.value).toBe(".Steve");
    expect(complete("give @").map((item) => item.value)).toEqual([
      "@a",
      "@p",
      "@r",
    ]);
  });
  it("preserves text after a replacement in the middle of a command", () => {
    const input = "gamemode cr @a",
      cursor = input.indexOf(" @a");
    const option = completeCommand(input, cursor, context)[0]!;
    expect(applyCompletion(input, option)).toEqual({
      value: "gamemode creative @a",
      cursor: 17,
    });
  });
  it("keeps item namespaces and only requests an item catalog at the item argument", () => {
    expect(needsItemCompletion("give @a dia", 11)).toBe(true);
    expect(needsItemCompletion("give Al", 7)).toBe(false);
    expect(needsItemCompletion("say diamond", 11)).toBe(false);
    expect(complete("give @a dia").map((item) => item.value)).toEqual([
      "minecraft:diamond_sword",
      "mod:diamond_wand",
    ]);
    expect(complete("give @a Unsafe")).toEqual([]);
  });
  it("suggests plugin commands from history without duplicating or accepting newlines", () => {
    expect(complete("plugin:i").map((item) => item.value)).toEqual([
      "plugin:inspect Alex",
    ]);
    expect(complete("bad")).toEqual([]);
    expect(complete("say hello")).toEqual([]);
    expect(complete("list\nsto")).toEqual([]);
    expect(complete("t").length).toBeLessThanOrEqual(8);
  });
});
describe("safe console colors", () => {
  it("keeps Minecraft formatting, hex colors and reset boundaries", () => {
    expect(consoleSegments("§6Gold §lbold§r plain")).toEqual([
      { text: "Gold ", color: "#ffaa00" },
      { text: "bold", color: "#ffaa00", bold: true },
      { text: " plain" },
    ]);
    expect(consoleSegments("§x§1§2§3§4§5§6Hex")).toEqual([
      { text: "Hex", color: "#123456" },
    ]);
    expect(consoleSegments("§ksecret§r public")).toEqual([{ text: "secret", obfuscated: true }, { text: " public" }]);
    expect(consoleSegments("§cRed§x still red").at(-1)?.color).toBe("#ff5555");
  });
  it("handles ANSI foreground colors, 256-color/truecolor and partial style resets", () => {
    expect(consoleSegments("\x1b[38;2;18;52;86mRGB\x1b[0m plain")).toEqual([
      { text: "RGB", color: "#123456" },
      { text: " plain" },
    ]);
    expect(consoleSegments("\x1b[38;5;196mRed")[0]?.color).toBe("#ff0000");
    expect(consoleSegments("\x1b[1;31mBold\x1b[22m red")).toEqual([
      { text: "Bold", color: "#ff6b6b", bold: true },
      { text: " red", color: "#ff6b6b" },
    ]);
    expect(consoleSegments("\x1b[38;2;999;0;0mSafe")).toEqual([
      { text: "Safe" },
    ]);
  });
  it("discards terminal actions and hyperlink controls while keeping literal HTML as text", () => {
    const input =
      "\x1b[2J\x1b]8;;https://example.com\x07<img src=x onerror=alert(1)>\x1b]8;;\x07";
    expect(consoleSegments(input)).toEqual([
      { text: "<img src=x onerror=alert(1)>" },
    ]);
    expect(consoleSegments("\x1b[48;2;0;0;0mVisible")).toEqual([
      { text: "Visible" },
    ]);
  });
  it("bounds styled DOM segments while retaining the text", () => {
    const input = "§aA§cB".repeat(3000);
    const segments = consoleSegments(input);
    expect(segments.length).toBeLessThanOrEqual(4096);
    expect(segments.map((segment) => segment.text).join("")).toBe(
      "AB".repeat(3000),
    );
  });
});
