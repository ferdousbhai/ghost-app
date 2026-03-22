import { useState, useEffect } from "react";
import { rpc } from "../rpc";
import type { Document } from "../../shared/rpc";

function getFileExtension(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot >= 0 ? path.slice(dot + 1).toLowerCase() : "";
}

function getExtDotColor(ext: string): string {
  if (ext === "md" || ext === "mdx") return "oklch(0.82 0.12 80)"; // amber
  if (ext === "json" || ext === "yaml" || ext === "yml" || ext === "toml") return "oklch(0.72 0.10 240)"; // blue
  if (["py", "ts", "tsx", "js", "jsx", "rs", "go"].includes(ext)) return "oklch(0.75 0.12 155)"; // green
  return "oklch(0.55 0 0)"; // muted gray
}

export function Documents() {
  const [allDocuments, setAllDocuments] = useState<Document[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [docsDir, setDocsDir] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadDocuments();
    rpc.request.getDocsDir({}).then(setDocsDir);
  }, []);

  async function loadDocuments() {
    const docs = await rpc.request.listDocuments({});
    setAllDocuments(docs);
    setDocuments(docs);
  }

  function handleSearch() {
    if (!searchQuery.trim()) {
      setDocuments(allDocuments);
      return;
    }
    const q = searchQuery.toLowerCase();
    setDocuments(
      allDocuments.filter(
        (d) =>
          d.path.toLowerCase().includes(q) ||
          d.title?.toLowerCase().includes(q)
      )
    );
  }

  async function selectDoc(path: string) {
    setSelectedPath(path);
    setCopied(false);
    const text = await rpc.request.readDocument({ path });
    setContent(text);
  }

  function handleRefresh() {
    loadDocuments();
  }

  function handleCopy() {
    if (content) {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function renderBreadcrumb(path: string) {
    const parts = path.split("/").filter(Boolean);
    return (
      <div className="flex items-center gap-1 text-sm font-mono min-w-0">
        {parts.map((part, i) => (
          <span key={i} className="flex items-center gap-1 min-w-0">
            {i > 0 && (
              <svg className="w-3 h-3 text-ghost-muted/40 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            )}
            <span className={`truncate ${i === parts.length - 1 ? "text-white/80" : "text-ghost-muted/60"}`}>
              {part}
            </span>
          </span>
        ))}
      </div>
    );
  }

  function renderLineNumbers(text: string) {
    const lines = text.split("\n");
    return (
      <div className="flex">
        <div
          className="select-none text-right pr-4 shrink-0"
          style={{ color: "oklch(1 0 0 / 0.15)", minWidth: "3rem" }}
        >
          {lines.map((_, i) => (
            <div key={i} className="leading-relaxed text-sm font-mono">{i + 1}</div>
          ))}
        </div>
        <pre className="text-sm text-white/80 font-mono whitespace-pre-wrap leading-relaxed flex-1 min-w-0">
          {text}
        </pre>
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden animate-fade-in">
      {/* Document list */}
      <div className="w-64 glass sidebar-border flex flex-col">
        <div className="p-3 section-divider space-y-2" style={{ borderTop: "none", borderBottom: "1px solid oklch(1 0 0 / 0.06)" }}>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ghost-muted/50 pointer-events-none"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search documents..."
                className="w-full pl-8 pr-3 py-1.5 glass-input text-sm"
              />
            </div>
          </div>
          <button
            onClick={handleRefresh}
            className="w-full px-3 py-1 text-[10px] tracking-wider uppercase font-mono transition-all duration-200"
            style={{
              color: "oklch(1 0 0 / 0.3)",
              border: "1px solid oklch(1 0 0 / 0.06)",
              borderRadius: "6px",
              background: "oklch(1 0 0 / 0.02)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "oklch(1 0 0 / 0.5)";
              e.currentTarget.style.borderColor = "oklch(1 0 0 / 0.1)";
              e.currentTarget.style.background = "oklch(1 0 0 / 0.04)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "oklch(1 0 0 / 0.3)";
              e.currentTarget.style.borderColor = "oklch(1 0 0 / 0.06)";
              e.currentTarget.style.background = "oklch(1 0 0 / 0.02)";
            }}
          >
            Refresh
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {documents.map((doc, i) => {
            const ext = getFileExtension(doc.path);
            const dotColor = getExtDotColor(ext);
            const isSelected = selectedPath === doc.path;
            return (
              <div
                key={doc.path}
                onClick={() => selectDoc(doc.path)}
                className={`px-3 py-2.5 text-sm cursor-pointer transition-all duration-200 ${
                  isSelected
                    ? "bg-ghost-amber/[0.08] text-white border-l-2 border-ghost-amber"
                    : "text-ghost-muted hover:bg-white/[0.03] hover:text-white/80 border-l-2 border-transparent"
                }`}
                style={{ animationDelay: `${i * 30}ms` }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.boxShadow = "inset 0 0 20px oklch(0.82 0.12 80 / 0.03)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div className="flex items-center gap-2 truncate">
                  <span
                    className="shrink-0 w-2 h-2 rounded-full"
                    style={{ backgroundColor: dotColor }}
                  />
                  <span className="truncate font-medium">{doc.title || doc.path}</span>
                </div>
                <div className="text-xs text-ghost-muted/60 truncate font-mono mt-0.5 pl-4">
                  {doc.path}
                </div>
              </div>
            );
          })}
          {documents.length === 0 && (
            <div className="px-4 py-8 animate-whisper-in">
              <div
                className="flex flex-col items-center justify-center py-8 px-4 text-center"
                style={{
                  border: "2px dashed oklch(1 0 0 / 0.08)",
                  borderRadius: "12px",
                  background: "oklch(1 0 0 / 0.01)",
                }}
              >
                {/* Folder + plus icon */}
                <div className="relative w-12 h-12 mb-4">
                  <div
                    className="absolute inset-0 rounded-xl flex items-center justify-center"
                    style={{ background: "oklch(0.82 0.12 80 / 0.06)" }}
                  >
                    <svg
                      className="w-6 h-6"
                      style={{ color: "oklch(0.82 0.12 80 / 0.4)" }}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 10.5v6m3-3H9m4.06-7.19-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
                      />
                    </svg>
                  </div>
                </div>
                <p className="text-xs font-medium text-white/50 mb-1">No documents yet</p>
                <p className="text-[11px] text-ghost-muted/50 leading-relaxed">
                  Drop files into your docs folder
                </p>
                {docsDir && (
                  <div
                    className="mt-3 px-3 py-1.5 max-w-full"
                    style={{
                      background: "oklch(1 0 0 / 0.03)",
                      borderRadius: "6px",
                      border: "1px solid oklch(1 0 0 / 0.05)",
                    }}
                  >
                    <p className="text-[10px] font-mono text-ghost-muted/40 break-all">
                      {docsDir}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Document viewer */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedPath && content !== null ? (
          <div className="flex-1 flex flex-col animate-whisper-in">
            <div className="px-6 py-3 flex items-center justify-between gap-3" style={{ borderBottom: "1px solid oklch(1 0 0 / 0.06)" }}>
              <div className="glass-card px-3 py-1.5 min-w-0 flex-1">
                {renderBreadcrumb(selectedPath)}
              </div>
              <button
                onClick={handleCopy}
                className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono transition-all duration-200"
                style={{
                  color: copied ? "oklch(0.75 0.12 155)" : "oklch(1 0 0 / 0.35)",
                  border: `1px solid ${copied ? "oklch(0.75 0.12 155 / 0.3)" : "oklch(1 0 0 / 0.08)"}`,
                  borderRadius: "8px",
                  background: copied ? "oklch(0.75 0.12 155 / 0.06)" : "oklch(1 0 0 / 0.03)",
                }}
                onMouseEnter={(e) => {
                  if (!copied) {
                    e.currentTarget.style.color = "oklch(1 0 0 / 0.6)";
                    e.currentTarget.style.borderColor = "oklch(1 0 0 / 0.15)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!copied) {
                    e.currentTarget.style.color = "oklch(1 0 0 / 0.35)";
                    e.currentTarget.style.borderColor = "oklch(1 0 0 / 0.08)";
                  }
                }}
              >
                {copied ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                  </svg>
                )}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="flex-1 overflow-auto glass" style={{ margin: "16px", borderRadius: "14px" }}>
              <div className="p-6">
                {renderLineNumbers(content)}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center animate-slide-up">
            <div className="text-center">
              {/* Spectral icon */}
              <div className="relative w-16 h-16 mx-auto mb-5">
                <div className="absolute inset-0 rounded-full bg-ghost-amber/10 animate-soul-breathe" />
                <div className="absolute inset-3 rounded-full bg-ghost-amber/5 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-ghost-amber/60"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                    />
                  </svg>
                </div>
              </div>
              <p className="text-lg font-display font-semibold text-white/90">
                Documents
              </p>
              <p className="text-sm mt-1.5 text-ghost-amber/60">
                Select a document to view its contents
              </p>
              {docsDir && (
                <div className="glass-card px-4 py-2.5 mt-4 mx-auto max-w-md">
                  <p className="text-xs font-mono text-ghost-muted break-all">
                    {docsDir}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
