import { useState, useEffect } from "react";
import { rpc } from "../rpc";
import type { Document } from "../../shared/rpc";

export function Documents() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [docsDir, setDocsDir] = useState("");

  useEffect(() => {
    loadDocuments();
    rpc.request.getDocsDir({}).then(setDocsDir);
  }, []);

  async function loadDocuments() {
    const docs = await rpc.request.listDocuments({});
    setDocuments(docs);
  }

  async function handleSearch() {
    if (!searchQuery.trim()) {
      loadDocuments();
      return;
    }
    const results = await rpc.request.searchDocuments({ query: searchQuery });
    setDocuments(results);
  }

  async function selectDoc(path: string) {
    setSelectedPath(path);
    const text = await rpc.request.readDocument({ path });
    setContent(text);
  }

  async function handleReindex() {
    const result = await rpc.request.reindexDocuments({});
    loadDocuments();
    alert(`Re-indexed ${result.indexed} documents`);
  }

  return (
    <div className="flex flex-1 overflow-hidden animate-fade-in">
      {/* Document list */}
      <div className="w-64 glass sidebar-border flex flex-col">
        <div className="p-3 section-divider space-y-2" style={{ borderTop: "none", borderBottom: "1px solid oklch(1 0 0 / 0.06)" }}>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search documents..."
              className="flex-1 px-3 py-1.5 glass-input text-sm"
            />
          </div>
          <button
            onClick={handleReindex}
            className="w-full px-3 py-1.5 text-xs btn-ghost"
          >
            Re-index
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {documents.map((doc, i) => (
            <div
              key={doc.path}
              onClick={() => selectDoc(doc.path)}
              className={`px-3 py-2.5 text-sm cursor-pointer transition-all duration-200 ${
                selectedPath === doc.path
                  ? "bg-ghost-amber/[0.08] text-white border-l-2 border-ghost-amber"
                  : "text-ghost-muted hover:bg-white/[0.03] hover:text-white/80 border-l-2 border-transparent"
              }`}
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <div className="truncate font-medium">{doc.title || doc.path}</div>
              <div className="text-xs text-ghost-muted/60 truncate font-mono mt-0.5">
                {doc.path}
              </div>
            </div>
          ))}
          {documents.length === 0 && (
            <div className="px-3 py-8 text-xs text-ghost-muted text-center animate-whisper-in">
              <p>No documents found.</p>
              <p className="mt-2">Add files to:</p>
              <p className="mt-1 font-mono text-white/40 break-all">{docsDir}</p>
            </div>
          )}
        </div>
      </div>

      {/* Document viewer */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedPath && content !== null ? (
          <div className="flex-1 flex flex-col animate-whisper-in">
            <div className="px-6 py-3 flex items-center gap-3" style={{ borderBottom: "1px solid oklch(1 0 0 / 0.06)" }}>
              <div className="glass-card px-3 py-1.5">
                <h2 className="text-sm font-mono text-ghost-muted truncate">
                  {selectedPath}
                </h2>
              </div>
            </div>
            <div className="flex-1 overflow-auto glass" style={{ margin: "16px", borderRadius: "14px" }}>
              <pre className="p-6 text-sm text-white/80 font-mono whitespace-pre-wrap leading-relaxed">
                {content}
              </pre>
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
                Add files to your docs folder and they'll appear here
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
