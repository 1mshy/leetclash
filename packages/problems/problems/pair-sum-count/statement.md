# Loot Split

After a long dungeon run, two adventurers agreed to split any treasure chest whose
total value is exactly `k` coins. The guild ledger lists the value of every gem they
hauled back. A chest is formed by picking **two different gems** from the ledger
(two distinct positions — the gems may have equal values).

Count how many ways there are to pick an unordered pair of positions `i < j` such
that the values at those positions sum to exactly `k`.

## Input

- Line 1: two integers `n` and `k` — the number of gems and the target chest value.
- Line 2: `n` integers `a_1 ... a_n` — the gem values.

## Output

A single integer: the number of pairs `(i, j)` with `i < j` and `a_i + a_j = k`.

## Constraints

- `1 <= n <= 200000`
- `-1000000000 <= a_i, k <= 1000000000`
- The answer can exceed the range of a 32-bit integer.

## Example 1

Input:

```
5 7
1 6 3 4 6
```

Output:

```
3
```

The valid pairs of positions are `(1,2)` with values `1+6`, `(1,5)` with values
`1+6`, and `(3,4)` with values `3+4`. Note the two 6s sit at different positions,
so both pairings with the 1 count.

## Example 2

Input:

```
4 10
5 5 5 5
```

Output:

```
6
```

Every one of the `C(4,2) = 6` position pairs sums to 10.
