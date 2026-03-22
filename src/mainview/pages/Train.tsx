import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { rpc } from "../rpc";

const SECTION_DESCRIPTIONS: Record<string, string> = {
  "About Me": "Your story",
  Personality: "How you think",
  "Communication Style": "How you speak",
  Expertise: "What you know",
  Guidelines: "Your boundaries",
  "Example Responses": "Your voice in action",
};

export function Train() {
  const [content, setContent] = useState("");
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [sections, setSections] = useState<Section[]>([]);
  const [lastCompletedIdx, setLastCompletedIdx] = useState<number | null>(null);
  const prevCompletedRef = useRef<Set<string>>(new Set());
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Load character on mount
  useEffect(() => {
    rpc.request.getCharacter({}).then((char) => {
      setContent(char);
      const parsed = parseSections(char);
      setSections(parsed);
      prevCompletedRef.current = new Set(
        parsed.filter((s) => s.isComplete).map((s) => s.title)
      );
    });
  }, []);

  // Auto-save with debounce (1s)
  const handleChange = useCallback((newContent: string) => {
    setContent(newContent);
    const newSections = parseSections(newContent);
    setSections(newSections);
    setSaveStatus("saving");

    // Detect newly completed section
    const newCompleted = new Set(
      newSections.filter((s) => s.isComplete).map((s) => s.title)
    );
    for (let i = 0; i < newSections.length; i++) {
      if (
        newSections[i].isComplete &&
        !prevCompletedRef.current.has(newSections[i].title)
      ) {
        setLastCompletedIdx(i);
        // Clear pulse after animation
        setTimeout(() => setLastCompletedIdx(null), 1500);
        break;
      }
    }
    prevCompletedRef.current = newCompleted;

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

  const wordCount = useMemo(() => {
    const trimmed = content.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }, [content]);

  return (
    <div className="flex flex-1 overflow-hidden animate-fade-in">
      {/* Section progress sidebar */}
      <div className="w-52 glass sidebar-border p-4 space-y-1.5">
        <h2 className="text-sm font-display font-semibold text-ghost-muted uppercase tracking-wider mb-4">
          Sections
        </h2>
        {sections.map((section, i) => (
          <button
            key={i}
            onClick={() => scrollToSection(section.title, textareaRef)}
            className="w-full text-left group"
          >
            <div className="flex items-start gap-2.5 px-2 py-1.5 rounded-lg transition-all duration-200 hover:bg-ghost-amber/5 hover:shadow-[0_0_12px_oklch(0.78_0.16_65/0.08)]">
              {/* Custom completion indicator */}
              <div className="mt-1 shrink-0">
                {section.isComplete ? (
                  <div
                    className={`w-2.5 h-2.5 rounded-full transition-all duration-300`}
                    style={{
                      background: "oklch(0.78 0.16 65)",
                      boxShadow: "0 0 6px oklch(0.78 0.16 65 / 0.5), 0 0 12px oklch(0.78 0.16 65 / 0.2)",
                      animation:
                        lastCompletedIdx === i
                          ? "section-complete-pulse 1.5s ease-out"
                          : "none",
                    }}
                  />
                ) : (
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{
                      border: "1.5px solid oklch(1 0 0 / 0.15)",
                      background: "transparent",
                    }}
                  />
                )}
              </div>
              <div className="flex flex-col min-w-0">
                <span
                  className={`text-sm leading-snug transition-colors duration-200 ${
                    section.isComplete
                      ? "text-white/90"
                      : "text-ghost-muted group-hover:text-white/60"
                  }`}
                >
                  {section.title}
                </span>
                <span className="text-[10px] leading-tight text-white/25 mt-0.5">
                  {SECTION_DESCRIPTIONS[section.title] ?? ""}
                </span>
              </div>
            </div>
          </button>
        ))}
        <div className="pt-4 section-divider">
          <div className="flex items-center justify-between text-xs text-ghost-muted">
            <span>
              {completedCount} / {sections.length} complete
            </span>
            <span className="font-mono text-[11px] tabular-nums" style={{ color: "oklch(0.78 0.16 65 / 0.7)" }}>
              {Math.round(progressPercent)}%
            </span>
          </div>
          <div
            className="mt-2 w-full h-1.5 rounded-full overflow-hidden"
            style={{ background: "oklch(1 0 0 / 0.08)" }}
          >
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
          <div className="flex items-center gap-2">
            {/* Ghost silhouette icon */}
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              className="opacity-50"
              style={{ filter: "drop-shadow(0 0 4px oklch(0.78 0.16 65 / 0.3))" }}
            >
              <path
                d="M12 2C7.58 2 4 5.58 4 10v8.5c0 .83.67 1.5 1.5 1.5s1-.67 1-1.5v-1c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v1c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-1c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v1c0 .83.45 1.5 1 1.5s1.5-.67 1.5-1.5V10c0-4.42-3.58-8-8-8z"
                fill="oklch(0.78 0.16 65 / 0.6)"
              />
              <circle cx="9.5" cy="10.5" r="1.2" fill="oklch(0.11 0.015 265)" />
              <circle cx="14.5" cy="10.5" r="1.2" fill="oklch(0.11 0.015 265)" />
            </svg>
            <h1 className="text-lg font-display font-semibold text-amber-glow">
              Character
            </h1>
          </div>
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
          className="train-editor flex-1 p-6 bg-transparent text-white/90 font-mono text-sm leading-relaxed resize-none focus:outline-none transition-all duration-300"
          placeholder="Start writing your character..."
          spellCheck={false}
        />
        <div className="glass px-6 py-2 section-divider text-xs text-ghost-muted flex items-center gap-4">
          <span>{content.length} characters</span>
          <span style={{ color: "oklch(1 0 0 / 0.15)" }}>|</span>
          <span>{wordCount} words</span>
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
