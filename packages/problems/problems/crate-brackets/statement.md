# Crate Manifest

Down at the Harborview freight yard, an ancient stamping machine records how
crates were packed inside one another. Round crates are stamped `(` and `)`,
square crates `[` and `]`, and the big reinforced crates `{` and `}`. Every time
a crate is opened for loading the machine stamps its opening bracket, and when
the crate is sealed it stamps the matching closing bracket.

A manifest is **valid** when the whole string is a properly nested bracket
sequence: every opening bracket is sealed by a closing bracket of the same
type, and crates are sealed in the reverse order they were opened (you cannot
seal a crate while something opened later inside it is still unsealed).

The night-shift inspector hands you a stack of manifests. For the given
manifest, decide whether it is valid.

## Input

- Line 1: an integer `n` — the length of the manifest.
- Line 2: a string of exactly `n` characters, each one of `(`, `)`, `[`, `]`,
  `{`, `}`.

## Output

Print `YES` if the manifest is a balanced, properly nested bracket sequence,
and `NO` otherwise.

## Constraints

- `1 <= n <= 200000`
- The string contains no characters other than the six bracket characters.

## Example 1

Input:

```
8
{[()()]}
```

Output:

```
YES
```

Every closing bracket seals the most recently opened crate of the same type,
so the manifest is valid.

## Example 2

Input:

```
4
([)]
```

Output:

```
NO
```

The round crate is sealed while the square crate opened inside it is still
open, so the nesting is broken even though every bracket type is paired.
