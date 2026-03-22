/**
 * System prompt builder for the ghost agent.
 * Accepts pre-loaded character content to avoid redundant file reads.
 */

export function buildSystemPrompt(options: {
  username: string | null;
  character: string | null;
  ghostDir: string;
}): string {
  const { username, character, ghostDir } = options;
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

  // Working directory layout
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

  return sections.join("\n\n");
}
