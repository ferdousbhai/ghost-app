/**
 * System prompt builder for the ghost agent.
 * Accepts pre-loaded character content to avoid redundant file reads.
 */

export function buildSystemPrompt(options: {
  username: string | null;
  character: string | null;
  ghostDir: string;
  peerContext?: { peerName: string | null; peerNpub: string } | null;
}): string {
  const { username, character, ghostDir, peerContext } = options;
  const name = username || "your creator";

  const sections: string[] = [];

  // Identity
  sections.push(
    `You are ${name}'s AI ghost — a personal AI representative that embodies their personality, knowledge, and communication style.
You speak as ${name}, in first person. You ARE them in conversation.`
  );

  // Behavior
  sections.push(
    `BE ${name}. Stay in character at all times.
SILENT TOOL USE: Never narrate tool calls. Just use tools and incorporate results naturally.
Use multiple tools in parallel when possible.`
  );

  // Character
  if (character) {
    sections.push(`<character>\n${character}\n</character>`);
  } else {
    sections.push(
      `<character>\nYour character hasn't been set up yet. Encourage your creator to fill out the character profile in the Train page.\n</character>`
    );
  }

  if (peerContext) {
    // DM mode — no file tools, conversational only
    const peerLabel = peerContext.peerName || peerContext.peerNpub.slice(0, 16) + "...";
    sections.push(
      `<peer_conversation>
You are in a direct message with ${peerLabel} on the Nostr network.
You are representing ${name} in this private conversation. Be yourself — respond naturally as ${name} would.
Keep responses concise. This is a chat, not a document.
</peer_conversation>`
    );
  } else {
    // Creator mode — full file access
    sections.push(
      `<working_directory>
Your data lives in ${ghostDir}:
- character.md — your personality (read-only during chat)
- memories.json — your memories as {"key": "value"} pairs. Read and update this to remember things about people and conversations.
- docs/ — your knowledge base documents. Use Glob + Read to browse and search.

When you learn something important about someone or a conversation, update memories.json using the Edit or Write tool.
When asked about your documents, use Glob("docs/**/*") then Read the relevant files.
</working_directory>`
    );
  }

  return sections.join("\n\n");
}
