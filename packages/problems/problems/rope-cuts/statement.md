# Rig Loft

The rig loft above the old harbor chandlery has taken its biggest order of the
season: a tall ship needs at least `k` ratlines, and every ratline must be cut to
the **same integer length**. The loft's stock is a rack of `n` ropes with integer
lengths. Each piece must be cut from a single rope — pieces can never be spliced
together — and whatever is left over from a rope after cutting is thrown into the
scrap bin.

The riggers want the pieces as long as possible, since a longer ratline can always
be trimmed on deck. Find the maximum integer piece length `L >= 1` such that the
rack can supply at least `k` pieces of length exactly `L`; a rope of length
`len_i` yields `floor(len_i / L)` such pieces. If even pieces of length `1` cannot
meet the order, print `0`.

## Input

- Line 1: two integers `n` and `k` — the number of ropes and the number of pieces
  required.
- Line 2: `n` integers `len_1 ... len_n` — the rope lengths.

## Output

A single integer: the maximum piece length `L`, or `0` if the order cannot be
filled at any length.

## Constraints

- `1 <= n <= 200000`
- `1 <= k <= 1000000000`
- `1 <= len_i <= 1000000000`

## Example 1

Input:

```
4 6
9 7 5 4
```

Output:

```
3
```

At `L = 3` the ropes yield `3 + 2 + 1 + 1 = 7 >= 6` pieces, while at `L = 4` they
yield only `2 + 1 + 1 + 1 = 5`, so `3` is the best possible length.

## Example 2

Input:

```
2 8
3 4
```

Output:

```
0
```

Even at length `1` the two ropes yield only `3 + 4 = 7 < 8` pieces, so the order
cannot be filled.
