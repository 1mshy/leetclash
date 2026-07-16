# Badge Squeeze

The badge printer at SigilCon, the annual conference of rune engravers, is
running low on ink. Every attendee's badge id is a string of lowercase
letters, and the printer firmware supports a simple run-length compression:
the id is split into maximal runs of equal letters, and each run is printed as
the letter followed by the run's length. For example, `aaabb` becomes `a3b2`
and `zzzzzzzzzz` becomes `z10`. The count is **always** printed, even for a
run of length one, so `abc` would become `a1b1c1`.

Compression only saves ink when it actually shortens the id. The firmware
therefore prints the compressed form **only if it is strictly shorter** than
the original id; otherwise it prints the original id unchanged.

Given one badge id, output exactly what the printer prints.

## Input

One line: a string `s` of lowercase English letters — the badge id.

## Output

One line: the run-length compressed form of `s` if it is strictly shorter
than `s`, otherwise `s` itself.

## Constraints

- `1 <= |s| <= 200000`
- `s` consists only of lowercase English letters `a`–`z`.

## Example 1

Input:

```
aaabbbbc
```

Output:

```
a3b4c1
```

The runs are `aaa`, `bbbb`, `c`; the compressed form has length 6, strictly
shorter than the original 8, so it is printed.

## Example 2

Input:

```
abcd
```

Output:

```
abcd
```

Compressing would give `a1b1c1d1` of length 8, longer than the original 4, so
the printer keeps the original id.
