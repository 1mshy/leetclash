# Night Watch

The Marovian Museum stores its treasure in one long vault corridor: `n` chests in
a row, and the ledger says chest `i` holds trinkets worth `a_i` coins. After
thirty years of quiet rounds, the night watchman has decided that tonight is his
retirement party — one sack, one shift, one chance.

The alarm wiring is the catch. Each chest shares a tremor sensor with its
immediate neighbours: the instant a chest is lifted off its pedestal, the chests
directly to its left and right bolt themselves to the floor for the rest of the
night. So whatever set of chests he walks out with, it can never contain two
chests that stand next to each other in the row.

Given the ledger, compute the largest total value the watchman can carry out.

## Input

- Line 1: an integer `n` — the number of chests.
- Line 2: `n` integers `a_1 ... a_n` — the value of each chest.

## Output

A single integer: the maximum total value of a set of chests in which no two
chosen chests are adjacent. The answer can exceed the range of a 32-bit integer.

## Constraints

- `1 <= n <= 200000`
- `0 <= a_i <= 1000000000`

## Example 1

Input:

```
4
5 1 1 5
```

Output:

```
10
```

Take the first and the last chest (`5 + 5`); they are not adjacent, and every
other non-adjacent selection is worth less.

## Example 2

Input:

```
5
3 7 4 6 5
```

Output:

```
13
```

The best haul is chests 2 and 4 (`7 + 6 = 13`), beating `3 + 4 + 5 = 12`.
