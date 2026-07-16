"use client";

import Editor from "@monaco-editor/react";
import { useEffect, useState } from "react";
import type { Language } from "@leetclash/shared";

/** Phase 1 language pair (PLAN §9). */
type DuelLanguage = Extract<Language, "python" | "cpp">;

const LANGUAGES: { id: DuelLanguage; label: string; monaco: string }[] = [
  { id: "python", label: "Python", monaco: "python" },
  { id: "cpp", label: "C++", monaco: "cpp" },
];

const FALLBACK_STARTER: Record<DuelLanguage, string> = {
  python: "# Write your solution here\n",
  cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n",
};

interface CodeEditorProps {
  /** Per-language starter code from the revealed problem. */
  starterCode?: Partial<Record<string, string>>;
  onChange?: (source: string, language: Language) => void;
  readOnly?: boolean;
}

export default function CodeEditor({ starterCode, onChange, readOnly }: CodeEditorProps) {
  const [language, setLanguage] = useState<DuelLanguage>("python");
  const [source, setSource] = useState<string>(FALLBACK_STARTER.python);

  const starterFor = (lang: DuelLanguage): string =>
    starterCode?.[lang] ?? FALLBACK_STARTER[lang];

  // Problem reveal ships real starter code — replace the placeholder once.
  useEffect(() => {
    if (starterCode) {
      setSource((prev) => {
        const next = starterCode[language] ?? prev;
        onChange?.(next, language);
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run on reveal only
  }, [starterCode]);

  // Code Golf design note (PLAN §1.2): live raw UTF-8 byte count of the source.
  const byteCount = new TextEncoder().encode(source).length;

  function handleLanguageChange(next: DuelLanguage) {
    setLanguage(next);
    setSource(starterFor(next));
    onChange?.(starterFor(next), next);
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
          onChange={(e) => handleLanguageChange(e.target.value as DuelLanguage)}
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
            readOnly: readOnly ?? false,
          }}
        />
      </div>

      <div className="border-t border-edge bg-panel px-3 py-1.5 text-right font-mono text-xs text-zinc-500">
        {byteCount} bytes
      </div>
    </div>
  );
}
