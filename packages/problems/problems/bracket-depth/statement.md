# Nested Crates

Crates are packed inside crates, marked by three kinds of brackets: `()`, `[]`,
and `{}`. A packing is **valid** when every crate is closed by a matching bracket
in the correct order (proper nesting, nothing left open, nothing closed early).

Given one line describing a packing, print its **maximum nesting depth** — the
deepest a crate is buried — or `-1` if the packing is invalid.

## Input

- A single line containing between `0` and `100000` characters, each one of
  `(`, `)`, `[`, `]`, `{`, `}`.

## Output

The maximum nesting depth of a valid packing, or `-1` if it is invalid. An empty
line is valid with depth `0`.

## Example

Input:

```
([{}])
```

Output:

```
3
```

The braces `{}` sit three crates deep. A string like `(]` or `((` would print
`-1`.
