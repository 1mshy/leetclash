# Spark Tally

The night shift at the Ironquay shipyard has one job before dawn: fuse a pile of
`n` cable segments into a single unbroken run for the new gantry crane. The
welding rig joins exactly **two** segments at a time. Welding segments of lengths
`x` and `y` burns `x + y` units of flux and leaves one segment of length `x + y`
on the bench.

The foreman tallies every spark: the cost of the whole night is the sum of the
costs of all the welds performed. Segments may be picked up and joined in any
order, and the order changes the tally dramatically. Compute the minimum possible
total cost to end up with one single segment. If the pile already holds just one
segment, no weld is needed and the cost is `0`.

## Input

- Line 1: an integer `n` — the number of cable segments.
- Line 2: `n` integers `a_1 ... a_n` — the segment lengths.

## Output

A single integer: the minimum total welding cost. The answer can exceed the range
of a 32-bit integer.

## Constraints

- `1 <= n <= 200000`
- `1 <= a_i <= 1000000000`

## Example 1

Input:

```
4
4 3 2 6
```

Output:

```
29
```

Weld `2 + 3 = 5` (cost 5), then `4 + 5 = 9` (cost 9), then `6 + 9 = 15` (cost 15)
for a total of `29` — no other order does better.

## Example 2

Input:

```
1
5
```

Output:

```
0
```

A single segment needs no welding at all.
