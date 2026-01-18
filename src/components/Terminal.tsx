import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import type { ForwardedRef } from "react";
import { spawn, type ChildProcess } from "child_process";
import { join } from "path";
import { appendFileSync } from "fs";
import { Terminal as XTerm } from "@xterm/headless";
import { StyledText, type TextChunk, createTextAttributes, RGBA, red } from "@opentui/core";

const LOG_FILE = "/tmp/multicode-debug.log";
function debugLog(msg: string) {
  appendFileSync(LOG_FILE, `${new Date().toISOString()} ${msg}\n`);
}

interface TerminalProps {
  cwd: string;
  command: string;
  args?: string[];
  onExit?: () => void;
  cols?: number;
  rows?: number;
}

export interface TerminalHandle {
  sendKey: (key: { name: string; sequence?: string; ctrl?: boolean; meta?: boolean }) => void;
}

const DEFAULT_COLS = 90;
const DEFAULT_ROWS = 20;

// 16-color palette als RGBA
const COLOR_PALETTE_16 = [
  RGBA.fromInts(0, 0, 0),         // 0: Black
  RGBA.fromInts(187, 0, 0),       // 1: Red
  RGBA.fromInts(0, 187, 0),       // 2: Green
  RGBA.fromInts(187, 187, 0),     // 3: Yellow
  RGBA.fromInts(0, 0, 187),       // 4: Blue
  RGBA.fromInts(187, 0, 187),     // 5: Magenta
  RGBA.fromInts(0, 187, 187),     // 6: Cyan
  RGBA.fromInts(187, 187, 187),   // 7: White
  RGBA.fromInts(85, 85, 85),      // 8: Bright Black
  RGBA.fromInts(255, 85, 85),     // 9: Bright Red
  RGBA.fromInts(85, 255, 85),     // 10: Bright Green
  RGBA.fromInts(255, 255, 85),    // 11: Bright Yellow
  RGBA.fromInts(85, 85, 255),     // 12: Bright Blue
  RGBA.fromInts(255, 85, 255),    // 13: Bright Magenta
  RGBA.fromInts(85, 255, 255),    // 14: Bright Cyan
  RGBA.fromInts(255, 255, 255),   // 15: Bright White
];

// xterm.js Color Mode Flags
const CM_DEFAULT = 0;
const CM_P16 = 0x1000000;     // 16-color palette
const CM_P256 = 0x2000000;    // 256-color palette
const CM_RGB = 0x3000000;     // 24-bit RGB

// Konvertiert xterm Farbindex zu RGBA
function xtermColorToRGBA(color: number, mode: number): RGBA | undefined {
  if (mode === CM_DEFAULT) {
    return undefined; // Default color
  }

  if (mode === CM_P16) {
    return COLOR_PALETTE_16[color];
  }

  if (mode === CM_P256) {
    // 256-color palette
    if (color < 16) {
      return COLOR_PALETTE_16[color];
    }
    if (color < 232) {
      // 216 colors (6x6x6 cube)
      const n = color - 16;
      const r = Math.floor(n / 36) * 51;
      const g = Math.floor((n % 36) / 6) * 51;
      const b = (n % 6) * 51;
      return RGBA.fromInts(r, g, b);
    }
    // Grayscale
    const gray = (color - 232) * 10 + 8;
    return RGBA.fromInts(gray, gray, gray);
  }

  if (mode === CM_RGB) {
    // RGB (packed as 0xRRGGBB)
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    return RGBA.fromInts(r, g, b);
  }

  return undefined;
}

// Debug: Log color info once
let colorLogged = false;

// Extrahiert den xterm Buffer als StyledText
function extractStyledText(term: XTerm, cols: number, rows: number): StyledText {
  const buffer = term.buffer.active;
  const chunks: TextChunk[] = [];

  for (let y = 0; y < rows; y++) {
    const line = buffer.getLine(y);
    if (!line) continue;

    let currentText = "";
    let currentFg: RGBA | undefined;
    let currentBg: RGBA | undefined;
    let currentAttrs = 0;

    for (let x = 0; x < cols; x++) {
      const cell = line.getCell(x);
      if (!cell) continue;

      // Wide character continuation überspringen
      if (cell.getWidth() === 0) continue;

      const char = cell.getChars() || " ";
      const fgColor = cell.getFgColor();
      const bgColor = cell.getBgColor();
      const fgMode = cell.getFgColorMode();
      const bgMode = cell.getBgColorMode();

      // Debug: Log non-default color modes
      if (!colorLogged && (fgMode !== 0 || bgMode !== 0)) {
        debugLog(`Found color! char="${char}" fgMode=${fgMode} fgColor=${fgColor} bgMode=${bgMode} bgColor=${bgColor}`);
        colorLogged = true;
      }

      const fg = xtermColorToRGBA(fgColor, fgMode);
      const bg = xtermColorToRGBA(bgColor, bgMode);

      const attrs = createTextAttributes({
        bold: !!cell.isBold(),
        dim: !!cell.isDim(),
        italic: !!cell.isItalic(),
        underline: !!cell.isUnderline(),
        inverse: !!cell.isInverse(),
        strikethrough: !!cell.isStrikethrough(),
      });

      // Check if style changed
      const fgChanged = fg?.toString() !== currentFg?.toString();
      const bgChanged = bg?.toString() !== currentBg?.toString();
      const attrsChanged = attrs !== currentAttrs;

      if ((fgChanged || bgChanged || attrsChanged) && currentText) {
        // Push current chunk
        chunks.push({
          __isChunk: true,
          text: currentText,
          fg: currentFg,
          bg: currentBg,
          attributes: currentAttrs || undefined,
        });
        currentText = "";
      }

      currentText += char;
      currentFg = fg;
      currentBg = bg;
      currentAttrs = attrs;
    }

    // Push remaining text of line
    if (currentText) {
      chunks.push({
        __isChunk: true,
        text: currentText.trimEnd(),
        fg: currentFg,
        bg: currentBg,
        attributes: currentAttrs || undefined,
      });
    }

    // Add newline (except for last line)
    if (y < rows - 1) {
      chunks.push({
        __isChunk: true,
        text: "\n",
      });
    }
  }

  // Remove trailing empty lines
  while (chunks.length > 0) {
    const last = chunks[chunks.length - 1]!;
    if (last.text === "\n" || last.text.trim() === "") {
      chunks.pop();
    } else {
      break;
    }
  }

  return new StyledText(chunks);
}

export const Terminal = forwardRef(function Terminal(
  { cwd, command, args = [], onExit, cols = DEFAULT_COLS, rows = DEFAULT_ROWS }: TerminalProps,
  ref: ForwardedRef<TerminalHandle>
) {
  const [content, setContent] = useState<StyledText | string>(`Starting ${command}...`);
  const termCols = cols;
  const termRows = rows;
  const processRef = useRef<ChildProcess | null>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const onExitRef = useRef(onExit);
  const startedRef = useRef(false);
  onExitRef.current = onExit;

  // Expose sendKey method to parent
  useImperativeHandle(ref, () => ({
    sendKey: (key) => {
      if (!processRef.current?.stdin) return;

      if (key.ctrl && key.name === "c") {
        processRef.current.stdin.write("\x03");
        return;
      }
      if (key.ctrl && key.name === "d") {
        processRef.current.stdin.write("\x04");
        return;
      }
      if (key.name === "return") {
        processRef.current.stdin.write("\r");
        return;
      }
      if (key.name === "backspace") {
        processRef.current.stdin.write("\x7f");
        return;
      }
      if (key.name === "up") {
        processRef.current.stdin.write("\x1b[A");
        return;
      }
      if (key.name === "down") {
        processRef.current.stdin.write("\x1b[B");
        return;
      }
      if (key.name === "left") {
        processRef.current.stdin.write("\x1b[D");
        return;
      }
      if (key.name === "right") {
        processRef.current.stdin.write("\x1b[C");
        return;
      }
      if (key.name === "escape") {
        processRef.current.stdin.write("\x1b");
        return;
      }
      if (key.sequence && !key.ctrl && !key.meta) {
        processRef.current.stdin.write(key.sequence);
      }
    },
  }));

  const argsString = args.join(" ");

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const term = new XTerm({
      cols: termCols,
      rows: termRows,
      allowProposedApi: true,
    });
    xtermRef.current = term;

    const projectRoot = join(import.meta.dir, "../..");
    const helperPath = join(projectRoot, "pty-helper.mjs");

    const proc = spawn("node", [helperPath, cwd, command, ...args], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        TERM_COLS: String(termCols),
        TERM_ROWS: String(termRows),
      },
    });

    processRef.current = proc;

    let pendingUpdate: ReturnType<typeof setTimeout> | null = null;

    const updateDisplay = () => {
      debugLog("updateDisplay called");
      try {
        const styledText = extractStyledText(term, termCols, termRows);
        debugLog(`Total chunks: ${styledText.chunks.length}`);

        // Debug: Vergleiche unsere Chunks mit OpenTUI's
        const ourChunksWithColor = styledText.chunks.filter(c => c.fg);
        debugLog(`Chunks with fg color: ${ourChunksWithColor.length}`);

        if (ourChunksWithColor.length > 0) {
          const opentuiChunk = red("test");
          const stringify = (obj: any) => JSON.stringify(obj, (k, v) => v instanceof Float32Array ? Array.from(v) : v, 2);
          debugLog("=== CHUNK COMPARISON ===");
          debugLog("OpenTUI red chunk: " + stringify(opentuiChunk));
          debugLog("Our chunk: " + stringify(ourChunksWithColor[0]));
        } else {
          // Log first few chunks to see what they look like
          const stringify = (obj: any) => JSON.stringify(obj, (k, v) => v instanceof Float32Array ? Array.from(v) : v, 2);
          debugLog("First 3 chunks: " + stringify(styledText.chunks.slice(0, 3)));
        }

        setContent(styledText);
      } catch (e) {
        debugLog("extractStyledText error: " + String(e));
        // Fallback to plain text
        const buffer = term.buffer.active;
        const lines: string[] = [];
        for (let y = 0; y < termRows; y++) {
          const line = buffer.getLine(y);
          if (line) {
            lines.push(line.translateToString(true));
          }
        }
        setContent(lines.join("\n").trimEnd() || "Waiting...");
      }
    };

    const scheduleUpdate = () => {
      if (pendingUpdate) {
        clearTimeout(pendingUpdate);
      }
      pendingUpdate = setTimeout(() => {
        pendingUpdate = null;
        updateDisplay();
      }, 16);
    };

    proc.stdout?.on("data", (data: Buffer) => {
      term.write(data.toString(), scheduleUpdate);
    });

    proc.stderr?.on("data", (data: Buffer) => {
      term.write(data.toString(), scheduleUpdate);
    });

    proc.on("exit", () => {
      processRef.current = null;
      onExitRef.current?.();
    });

    proc.on("error", (err) => {
      setContent(`Error: ${err.message}`);
    });

    return () => {
      if (proc && !proc.killed) {
        proc.kill();
      }
      processRef.current = null;
      xtermRef.current?.dispose();
      xtermRef.current = null;
      startedRef.current = false;
    };
  }, [cwd, command, argsString]);

  return (
    <box flexGrow={1}>
      <text content={content} />
    </box>
  );
});
