"use client";

import Editor from "@monaco-editor/react";
import { useState } from "react";
import type { Language } from "@leetclash/shared";

/** Phase 1 language pair (PLAN §9). */
const LANGUAGES: { id: Extract<Language, "python" | "cpp">; label: string; monaco: string }[] = [
  { id: "python", label: "Python", monaco: "python" },
  { id: "cpp", label: "C++", monaco: "cpp" },
];

const STARTER: Record<"python" | "cpp", string> = {
  python: "# Write your solution here\n",
  cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n",
};

interface CodeEditorProps {
  onChange?: (source: string, language: Language) => void;
}

export default function CodeEditor({ onChange }: CodeEditorProps) {
  const [language, setLanguage] = useState<"python" | "cpp">("python");
  const [source, setSource] = useState<string>(STARTER.python);

  // Code Golf design note (PLAN §1.2): live raw UTF-8 byte count of the source.
  const byteCount = new TextEncoder().encode(source).length;

  function handleLanguageChange(next: "python" | "cpp") {
    setLanguage(next);
    setSource(STARTER[next]);
    onChange?.(STARTER[next], next);
  }

  function handleEditorChange(value: string | undefined) {
    const v = value ?? "";
    setSource(v);
    onChange?.(v, language);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-edge bg-panel px-3 py-2">
        <select
          value={language}
          onChange={(e) => handleLanguageChange(e.target.value as "python" | "cpp")}
          className="rounded border border-edge bg-surface px-2 py-1 font-mono text-xs text-zinc-300 focus:border-accent focus:outline-none"
        >
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      <div className="min-h-0 flex-1">
        <Editor
          language={LANGUAGES.find((l) => l.id === language)?.monaco}
          value={source}
          onChange={handleEditorChange}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
        />
      </div>

      <div className="border-t border-edge bg-panel px-3 py-1.5 text-right font-mono text-xs text-zinc-500">
        {byteCount} bytes
      </div>
    </div>
  );
}
