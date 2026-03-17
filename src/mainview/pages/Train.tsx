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

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Section progress sidebar */}
      <div className="w-48 border-r border-neutral-800 p-4 space-y-3 bg-neutral-900/50">
        <h2 className="text-sm font-medium text-neutral-300 mb-4">Sections</h2>
        {sections.map((section, i) => (
          <button
            key={i}
            onClick={() => scrollToSection(section.title, textareaRef)}
            className="w-full text-left"
          >
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${section.isComplete ? "bg-green-500" : "bg-neutral-600"}`}
              />
              <span
                className={`text-sm ${section.isComplete ? "text-neutral-200" : "text-neutral-500"}`}
              >
                {section.title}
              </span>
            </div>
          </button>
        ))}
        <div className="pt-4 border-t border-neutral-800">
          <div className="text-xs text-neutral-500">
            {sections.filter((s) => s.isComplete).length} / {sections.length}{" "}
            complete
          </div>
          <div className="mt-2 w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{
                width: `${sections.length ? (sections.filter((s) => s.isComplete).length / sections.length) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between px-6 py-3 border-b border-neutral-800">
          <h1 className="text-lg font-medium">Character</h1>
          <div className="text-xs text-neutral-500">
            {saveStatus === "saving" && "Saving..."}
            {saveStatus === "saved" && "Saved"}
            {saveStatus === "error" && (
              <span className="text-red-400">Error saving</span>
            )}
          </div>
        </div>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => handleChange(e.target.value)}
          className="flex-1 p-6 bg-transparent text-neutral-100 font-mono text-sm leading-relaxed resize-none focus:outline-none"
          placeholder="Start writing your character..."
          spellCheck={false}
        />
        <div className="px-6 py-2 border-t border-neutral-800 text-xs text-neutral-500">
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
