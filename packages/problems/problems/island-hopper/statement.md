# Island Hopper

A ferry frog works an archipelago laid out as a grid of `r` rows and `c` columns.
Each cell is one of:

- `.` — a lily pad the frog can land on
- `#` — open water (deadly; the frog never lands here)
- `F` — the frog's home pad (exactly one)
- `H` — the harbor pad where today's passenger waits (exactly one)

In one hop the frog moves to an adjacent cell **up, down, left, or right** — never
diagonally, and never off the grid. `F` and `H` are ordinary pads the frog can
stand on.

Print the minimum number of hops needed to travel from `F` to `H`, or `-1` if the
harbor cannot be reached at all.

## Input

- Line 1: two integers `r` and `c`.
- Next `r` lines: a string of exactly `c` characters describing one row of the grid.

## Output

A single integer: the minimum number of hops, or `-1` if unreachable.

## Constraints

- `1 <= r, c <= 1000`
- The grid contains exactly one `F` and exactly one `H`.

## Example 1

Input:

```
3 4
F..#
.#.#
...H
```

Output:

```
5
```

One shortest route: right, right, down, down, right — 5 hops, skirting the water
in the middle and on the right edge.

## Example 2

Input:

```
3 3
F#H
.#.
.#.
```

Output:

```
-1
```

A solid wall of water splits the grid, so the harbor is unreachable.
