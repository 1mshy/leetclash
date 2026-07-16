# Signal Ladder

Along the coast road, `n` relay towers stand in a single line from west to east,
and tower `i` has height `h_i`. At dusk the lighthouse keeper launches a signal
at the westernmost stretch of the line and lets it hop its way east from tower to
tower.

The optics are unforgiving: a hop can only land on a tower that stands **strictly
taller** than the one the signal just left — a beam fired at an equal or shorter
tower dissolves into the haze. The signal may start at any tower, may skip over
any towers it likes, but must always keep moving east (towers are used in their
original left-to-right order). The keeper wants the relay chain to touch as many
towers as possible before the signal fades. Compute the maximum number of towers
a single signal chain can use.

## Input

- Line 1: an integer `n` — the number of towers.
- Line 2: `n` integers `h_1 ... h_n` — the tower heights from west to east.

## Output

A single integer: the maximum number of towers in one valid signal chain.

## Constraints

- `1 <= n <= 200000`
- `1 <= h_i <= 1000000000`

## Example 1

Input:

```
6
3 1 4 1 5 9
```

Output:

```
4
```

One best chain is `3 -> 4 -> 5 -> 9`, using four towers of strictly increasing
height.

## Example 2

Input:

```
5
2 2 2 2 2
```

Output:

```
1
```

Every hop must land on a strictly taller tower, so among equal heights no hop is
ever possible and the chain is a single tower.
