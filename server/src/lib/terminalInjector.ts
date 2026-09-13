import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Escapes text for safe interpolation inside a double-quoted AppleScript string literal. */
function escapeForAppleScript(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\r\n]+/g, " ")
    .trim();
}

/**
 * Types `text` into whatever's currently focused in VS Code, then presses Return.
 * Requires the calling process to have macOS Accessibility permission granted
 * (System Settings -> Privacy & Security -> Accessibility). Only supports macOS.
 */
export async function injectIntoVSCode(text: string): Promise<void> {
  if (process.platform !== "darwin") {
    throw new Error("Terminal injection is only supported on macOS.");
  }
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Nothing to inject.");

  const escaped = escapeForAppleScript(trimmed);
  const script = `
    tell application "Visual Studio Code" to activate
    delay 0.3
    tell application "System Events"
      keystroke "${escaped}"
      key code 36
    end tell
  `;

  await execFileAsync("osascript", ["-e", script]);
}
