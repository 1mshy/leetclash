"use client";

import Editor, { type OnMount } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import type { Language } from "@leetclash/shared";

/** Launch set (PLAN §4.3): all six ship in Phase 2. */
const LANGUAGES: { id: Language; label: string; monaco: string }[] = [
  { id: "python", label: "Python", monaco: "python" },
  { id: "cpp", label: "C++", monaco: "cpp" },
  { id: "javascript", label: "JavaScript", monaco: "javascript" },
  { id: "java", label: "Java", monaco: "java" },
  { id: "go", label: "Go", monaco: "go" },
  { id: "rust", label: "Rust", monaco: "rust" },
];

const FALLBACK_STARTER: Record<Language, string> = {
  python: "import sys\n\ndef main() -> None:\n    data = sys.stdin.read().split()\n    # Write your solution here\n\nif __name__ == \"__main__\":\n    main()\n",
  cpp: "#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    // Write your solution here\n    return 0;\n}\n",
  javascript: "const data = require(\"fs\").readFileSync(0, \"utf8\").split(/\\s+/);\n// Write your solution here\n",
  java: "import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        // Write your solution here\n    }\n}\n",
  go: "package main\n\nimport (\n\t\"bufio\"\n\t\"fmt\"\n\t\"os\"\n)\n\nfunc main() {\n\treader := bufio.NewReader(os.Stdin)\n\t_ = reader\n\t// Write your solution here\n\t_ = fmt.Sprint\n}\n",
  rust: "use std::io::{self, Read};\n\nfn main() {\n    let mut input = String::new();\n    io::stdin().read_to_string(&mut input).unwrap();\n    // Write your solution here\n}\n",
};

interface CodeEditorProps {
  /** Per-language starter code from the revealed problem. */
  starterCode?: Partial<Record<string, string>>;
  onChange?: (source: string, language: Language) => void;
  /** A single paste event's size (chars) — accumulated by the parent (§6.6). */
  onPaste?: (size: number) => void;
  /** Same-language modes (Fastest Runtime) lock the editor to one language. */
  lockedLanguage?: Language | null;
  readOnly?: boolean;
}

export default function CodeEditor({
  starterCode,
  onChange,
  onPaste,
  lockedLanguage,
  readOnly,
}: CodeEditorProps) {
  const [language, setLanguage] = useState<Language>(lockedLanguage ?? "python");
  const [source, setSource] = useState<string>(FALLBACK_STARTER[lockedLanguage ?? "python"]);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const starterFor = (lang: Language): string => starterCode?.[lang] ?? FALLBACK_STARTER[lang];

  // Lock arrived (same-language mode): pin the language.
  useEffect(() => {
    if (lockedLanguage && lockedLanguage !== language) {
      setLanguage(lockedLanguage);
      setSource(starterFor(lockedLanguage));
      onChange?.(starterFor(lockedLanguage), lockedLanguage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedLanguage]);

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

  function handleLanguageChange(next: Language) {
    setLanguage(next);
    setSource(starterFor(next));
    onChange?.(starterFor(next), next);
  }

  function handleEditorChange(value: string | undefined) {
    const v = value ?? "";
    setSource(v);
    onChange?.(v, language);
  }

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
    // Paste telemetry (§6.6): report each paste's size to the parent.
    editor.onDidPaste((e) => {
      const text = editor.getModel()?.getValueInRange(e.range) ?? "";
      if (text.length > 0) onPaste?.(text.length);
    });
  };

  const options = LANGUAGES.filter((l) => !lockedLanguage || l.id === lockedLanguage);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-edge bg-panel px-3 py-2">
        <select
          value={language}
          onChange={(e) => handleLanguageChange(e.target.value as Language)}
          disabled={!!lockedLanguage}
          className="rounded border border-edge bg-surface px-2 py-1 font-mono text-xs text-zinc-300 focus:border-accent focus:outline-none disabled:opacity-60"
        >
          {options.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        {lockedLanguage && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            same-language match
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1">
        <Editor
          language={LANGUAGES.find((l) => l.id === language)?.monaco}
          value={source}
          onChange={handleEditorChange}
          onMount={handleMount}
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
