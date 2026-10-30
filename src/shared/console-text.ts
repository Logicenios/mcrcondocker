import { NAMED_COLORS, type TextSegment } from "./mctext.js";
type Style = Omit<TextSegment, "text">;
const legacyColors = Object.values(NAMED_COLORS);
const ansi = [
  "#1c2431",
  "#ff6b6b",
  "#78d5a3",
  "#e9c46a",
  "#7aa2f7",
  "#c099ff",
  "#70d6e5",
  "#dce3ed",
  "#7b8799",
  "#ff8c8c",
  "#9ee8b8",
  "#ffe39a",
  "#a6c4ff",
  "#d8baff",
  "#a0edf4",
  "#ffffff",
];
function palette(index: number): string | undefined {
  if (!Number.isInteger(index) || index < 0 || index > 255) return;
  if (index < 16) return ansi[index];
  if (index >= 232) {
    const value = (8 + (index - 232) * 10).toString(16).padStart(2, "0");
    return `#${value}${value}${value}`;
  }
  const n = index - 16,
    step = (value: number) => (value === 0 ? 0 : 55 + value * 40);
  return (
    "#" +
    [Math.floor(n / 36), Math.floor(n / 6) % 6, n % 6]
      .map((value) => step(value).toString(16).padStart(2, "0"))
      .join("")
  );
}
/** Only text and whitelisted styles reach the DOM; terminal actions and OSC links are discarded. */
export function consoleSegments(input: string): TextSegment[] {
  const out: TextSegment[] = [];
  let style: Style = {},
    last = 0;
  const controls =
    /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -/]*[@-~]|§x(?:§[0-9a-f]){6}|§./gi;
  const append = (text: string) => {
    text = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
    if (!text) return;
    const previous = out[out.length - 1];
    if (out.length >= 4096 && previous) {
      previous.text += text;
      return;
    }
    out.push({ text, ...style });
  };
  for (const match of input.matchAll(controls)) {
    append(input.slice(last, match.index));
    last = match.index! + match[0].length;
    const token = match[0];
    if (token.startsWith("§")) {
      const code = token[1]!.toLowerCase(),
        index = "0123456789abcdef".indexOf(code);
      if (index >= 0) style = { color: legacyColors[index] };
      else if (code === "x" && token.length === 14)
        style = {
          color: "#" + token.slice(2).replaceAll("§", "").toLowerCase(),
        };
      else if (code === "r") style = {};
      else if (code === "l") style.bold = true;
      else if (code === "o") style.italic = true;
      else if (code === "n") style.underlined = true;
      else if (code === "m") style.strikethrough = true;
      else if (code === "k") style.obfuscated = true;
    } else if (
      token.startsWith("\x1b[") &&
      token.endsWith("m") &&
      /^\d*(;\d*)*$/.test(token.slice(2, -1))
    ) {
      const codes = token.slice(2, -1).split(";").map(Number);
      for (let i = 0; i < codes.length; i++) {
        const code = codes[i]!;
        if (code === 0) style = {};
        else if (code === 1) style.bold = true;
        else if (code === 3) style.italic = true;
        else if (code === 4) style.underlined = true;
        else if (code === 9) style.strikethrough = true;
        else if (code === 22) delete style.bold;
        else if (code === 23) delete style.italic;
        else if (code === 24) delete style.underlined;
        else if (code === 29) delete style.strikethrough;
        else if (code === 39) delete style.color;
        else if (code >= 30 && code <= 37) style.color = ansi[code - 30];
        else if (code >= 90 && code <= 97) style.color = ansi[code - 90 + 8];
        else if (code === 38 || code === 48) {
          let color: string | undefined;
          if (codes[i + 1] === 5) {
            color = palette(codes[i + 2]!);
            i += 2;
          } else if (codes[i + 1] === 2) {
            const rgb = codes.slice(i + 2, i + 5);
            if (
              rgb.length === 3 &&
              rgb.every(
                (value) =>
                  Number.isInteger(value) && value >= 0 && value <= 255,
              )
            )
              color =
                "#" +
                rgb
                  .map((value) => value.toString(16).padStart(2, "0"))
                  .join("");
            i += 4;
          }
          if (code === 38 && color) style.color = color;
        }
      }
    }
  }
  append(input.slice(last));
  return out;
}
