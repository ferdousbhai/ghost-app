import { useState, useEffect, useRef, useCallback } from "react";
import { rpc } from "../rpc";

export function Train() {
  const [content, setContent] = useState("");
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [sections, setSections] = useState<Section[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Load character on mount
  useEffect(() => {
    rpc.request.getCharacter({}).then((char) => {
      setContent(char);
      setSections(parseSections(char));
    });
  }, []);

  // Auto-save with debounce (1s)
  const handleChange = useCallback((newContent: string) => {
    setContent(newContent);
    setSections(parseSections(newContent));
    setSaveStatus("saving");

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await rpc.request.saveCharacter({ content: newContent });
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch {
        setSaveStatus("error");
      }
    }, 1000);
  }, []);

  const completedCount = sections.filter((s) => s.isComplete).length;
  const progressPercent = sections.length
    ? (completedCount / sections.length) * 100
    : 0;

  return (
    <div className="flex flex-1 overflow-hidden animate-fade-in">
      {/* Section progress sidebar */}
      <div className="w-48 glass sidebar-border p-4 space-y-3">
        <h2 className="text-sm font-display font-semibold text-ghost-muted uppercase tracking-wider mb-4">
          Sections
        </h2>
        {sections.map((section, i) => (
          <button
            key={i}
            onClick={() => scrollToSection(section.title, textareaRef)}
            className="w-full text-left group"
          >
            <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-all duration-200 hover:bg-ghost-amber/5 hover:shadow-[0_0_12px_oklch(0.78_0.16_65/0.08)]">
              <div
                className={`w-2 h-2 rounded-full shrink-0 transition-all duration-300 ${
                  section.isComplete
                    ? "bg-ghost-amber shadow-[0_0_6px_oklch(0.78_0.16_65/0.4)]"
                    : "bg-white/10"
                }`}
              />
              <span
                className={`text-sm transition-colors duration-200 ${
                  section.isComplete
                    ? "text-white/90"
                    : "text-ghost-muted group-hover:text-white/60"
                }`}
              >
                {section.title}
              </span>
            </div>
          </button>
        ))}
        <div className="pt-4 section-divider">
          <div className="text-xs text-ghost-muted">
            {completedCount} / {sections.length} complete
          </div>
          <div className="mt-2 w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full progress-energy rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between px-6 py-3 section-divider" style={{ borderTop: "none", borderBottom: "1px solid oklch(1 0 0 / 0.06)" }}>
          <h1 className="text-lg font-display font-semibold text-amber-glow">
            Character
          </h1>
          <div className="text-xs">
            {saveStatus === "saving" && (
              <span className="text-ghost-muted">Saving...</span>
            )}
            {saveStatus === "saved" && (
              <span className="text-ghost-amber">Saved</span>
            )}
            {saveStatus === "error" && (
              <span className="text-ghost-rose">Error saving</span>
            )}
          </div>
        </div>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => handleChange(e.target.value)}
          className="flex-1 p-6 bg-transparent text-white/90 font-mono text-sm leading-relaxed resize-none focus:outline-none transition-shadow duration-300 focus:shadow-[0_4px_24px_-8px_oklch(0.78_0.16_65/0.1)]"
          placeholder="Start writing your character..."
          spellCheck={false}
        />
        <div className="glass px-6 py-2 section-divider text-xs text-ghost-muted">
          {content.length} characters
        </div>
      </div>
    </div>
  );
}

// Parse sections from markdown
type Section = { title: string; isComplete: boolean; offset: number };

function parseSections(markdown: string): Section[] {
  const sectionTitles = [
    "About Me",
    "Personality",
    "Communication Style",
    "Expertise",
    "Guidelines",
    "Example Responses",
  ];
  return sectionTitles.map((title) => {
    const regex = new RegExp(`## ${title}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`);
    const match = markdown.match(regex);
    const body = match?.[1]?.trim() || "";
    // Section is complete if it has content beyond just the placeholder/prompt
    const isComplete =
      body.length > 0 && !body.startsWith("[Replace") && !body.startsWith("*");
    const offset = markdown.indexOf(`## ${title}`);
    return { title, isComplete, offset };
  });
}

function scrollToSection(
  title: string,
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
) {
  const textarea = textareaRef.current;
  if (!textarea) return;
  const idx = textarea.value.indexOf(`## ${title}`);
  if (idx === -1) return;
  textarea.focus();
  textarea.setSelectionRange(idx, idx);
  // Approximate scroll position
  const lines = textarea.value.substring(0, idx).split("\n").length;
  const lineHeight = 24;
  textarea.scrollTop = Math.max(0, lines * lineHeight - 100);
}
