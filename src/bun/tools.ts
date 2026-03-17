import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { spawn } from "child_process";

/** Read a file from the filesystem. */
export function readFile(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch (err: any) {
    return `Error reading file: ${err.message}`;
  }
}

/** Write content to a file (creates directories if needed). */
export function writeFile(path: string, content: string): string {
  try {
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(path, content, "utf-8");
    return `File written: ${path}`;
  } catch (err: any) {
    return `Error writing file: ${err.message}`;
  }
}

/** Find and replace in a file. */
export function editFile(path: string, oldText: string, newText: string): string {
  try {
    const content = readFileSync(path, "utf-8");
    if (!content.includes(oldText)) {
      return `Error: Could not find the text to replace in ${path}`;
    }
    const updated = content.replace(oldText, newText);
    writeFileSync(path, updated, "utf-8");
    return `File edited: ${path}`;
  } catch (err: any) {
    return `Error editing file: ${err.message}`;
  }
}

// ---------------------------------------------------------------------------
// Bash execution
// ---------------------------------------------------------------------------

/** Execute a bash command with timeout. Returns stdout + stderr combined. */
export async function executeBash(command: string, timeoutMs = 30000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("bash", ["-c", command], {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024, // 1MB
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

    proc.on("close", (code) => {
      const output = stdout + (stderr ? `\n[stderr] ${stderr}` : "");
      if (code !== 0) {
        resolve(`[exit code ${code}]\n${output}`);
      } else {
        resolve(output || "(no output)");
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to execute: ${err.message}`));
    });
  });
}

// ---------------------------------------------------------------------------
// Tool approval flow
// ---------------------------------------------------------------------------

/** In-memory store for pending tool calls. Maps callId -> { resolve, reject, toolCall } */
const pendingApprovals = new Map<string, {
  toolCall: { id: string; name: string; args: Record<string, unknown> };
  resolve: (result: string) => void;
  reject: (reason: string) => void;
}>();

/** Request approval for a tool call. Returns a promise that resolves when approved/denied. */
export function requestApproval(toolCall: { id: string; name: string; args: Record<string, unknown> }): Promise<string> {
  return new Promise((resolve, reject) => {
    pendingApprovals.set(toolCall.id, { toolCall, resolve, reject });
  });
}

/** Get all pending tool calls for display. */
export function getPendingToolCalls(): Array<{ id: string; name: string; args: Record<string, unknown>; status: "pending" }> {
  return Array.from(pendingApprovals.values()).map(({ toolCall }) => ({
    ...toolCall,
    status: "pending" as const,
  }));
}

/** Approve a tool call, execute it, and resolve the promise. */
export async function approveToolCall(callId: string): Promise<string> {
  const pending = pendingApprovals.get(callId);
  if (!pending) throw new Error("No pending tool call with that ID");

  pendingApprovals.delete(callId);

  try {
    let result: string;
    if (pending.toolCall.name === "bash") {
      result = await executeBash(pending.toolCall.args.command as string);
    } else {
      result = `Unknown tool: ${pending.toolCall.name}`;
    }
    pending.resolve(result);
    return result;
  } catch (err: any) {
    const msg = err.message || "Execution failed";
    pending.reject(msg);
    return msg;
  }
}

/** Deny a tool call. */
export function denyToolCall(callId: string): void {
  const pending = pendingApprovals.get(callId);
  if (!pending) return;
  pendingApprovals.delete(callId);
  pending.resolve("[Tool call denied by user]");
}
