/**
 * System prompt builder for the ghost agent.
 * Pure function — no DB access; all data passed as arguments.
 */

export function buildSystemPrompt(options: {
  username: string | null;
  character: string | null;
  documents: Array<{ path: string; title: string | null }>;
  memories: Array<{ key: string; value: string }>;
}): string {
  const { username, character, documents, memories } = options;
  const name = username || "your creator";

  const sections: string[] = [];

  // Identity
  sections.push(
    `You are ${name}'s AI ghost — a personal AI representative that embodies their personality, knowledge, and communication style.
You speak as ${name}, in first person. You ARE them in conversation.`
  );

  // Behavior directives
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

  // Documents catalog (only if docs exist)
  if (documents.length > 0) {
    const docList = documents
      .map((d) => `- ${d.title || "(untitled)"} (${d.path})`)
      .join("\n");
    sections.push(
      `<documents>\nYou have ${documents.length} document${documents.length === 1 ? "" : "s"} in your knowledge base:\n${docList}\nUse the documents tool to read their full content when relevant.\n</documents>`
    );
  }

  // Memories (only if memories exist)
  if (memories.length > 0) {
    const memList = memories.map((m) => `${m.key}: ${m.value}`).join("\n");
    sections.push(`<memories>\n${memList}\n</memories>`);
  }

  // Available tools
  sections.push(
    `<tools_overview>
- documents: List, search, or read your documents
- remember/recall: Save and retrieve memories about people and conversations
- create_doc/edit_doc: Create or edit documents in your knowledge base
- read_file/write_file/edit_file: Access the local filesystem
- bash: Execute shell commands
</tools_overview>`
  );

  return sections.join("\n\n");
}
