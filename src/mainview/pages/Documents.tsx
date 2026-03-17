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
    <div className="flex flex-1 overflow-hidden">
      {/* Document list */}
      <div className="w-64 border-r border-neutral-800 flex flex-col bg-neutral-900/50">
        <div className="p-3 border-b border-neutral-800 space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search documents..."
              className="flex-1 px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-sm focus:outline-none focus:border-neutral-500 placeholder-neutral-500"
            />
          </div>
          <button
            onClick={handleReindex}
            className="w-full px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
          >
            Re-index
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {documents.map((doc) => (
            <div
              key={doc.path}
              onClick={() => selectDoc(doc.path)}
              className={`px-3 py-2 text-sm cursor-pointer border-b border-neutral-800/50 ${
                selectedPath === doc.path
                  ? "bg-neutral-800 text-white"
                  : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
              }`}
            >
              <div className="truncate font-medium">{doc.title || doc.path}</div>
              <div className="text-xs text-neutral-600 truncate">{doc.path}</div>
            </div>
          ))}
          {documents.length === 0 && (
            <div className="px-3 py-8 text-xs text-neutral-500 text-center">
              <p>No documents found.</p>
              <p className="mt-2">Add files to:</p>
              <p className="mt-1 font-mono text-neutral-400 break-all">{docsDir}</p>
            </div>
          )}
        </div>
      </div>

      {/* Document viewer */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedPath && content !== null ? (
          <>
            <div className="px-6 py-3 border-b border-neutral-800 flex items-center gap-3">
              <h2 className="text-sm font-medium truncate">{selectedPath}</h2>
            </div>
            <pre className="flex-1 overflow-auto p-6 text-sm text-neutral-300 font-mono whitespace-pre-wrap leading-relaxed">
              {content}
            </pre>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-neutral-500">
            <div className="text-center">
              <p className="text-lg font-medium">Documents</p>
              <p className="text-sm mt-1">
                Add files to your docs folder and they'll appear here
              </p>
              {docsDir && (
                <p className="text-xs mt-3 font-mono text-neutral-600 break-all max-w-md">
                  {docsDir}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
