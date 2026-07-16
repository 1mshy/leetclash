# Power Surge

The old tidal generator at Gearspring Cove feeds the whole village grid, and
its brass meter logs one net reading per minute: positive when the turbine
pushes power into the batteries, negative when the ebbing tide drags power
back out. The village smith wants to fire up the arc furnace, which must run
for **exactly `k` consecutive minutes**, and she wants to schedule it over the
stretch of the log where the generator banked the most total power.

Given the full log of `n` readings, find the maximum possible sum of `k`
consecutive readings. Note that every reading may be negative — on a bad
night the best stretch can still lose power, and the smith wants the least
bad one.

## Input

- Line 1: two integers `n` and `k` — the number of readings and the length of
  the furnace run.
- Line 2: `n` integers `a_1 ... a_n` — the readings, in log order.

## Output

A single integer: the maximum sum over any `k` consecutive readings.

## Constraints

- `1 <= k <= n <= 200000`
- `-1000000000 <= a_i <= 1000000000`
- The answer can exceed the range of a 32-bit integer.

## Example 1

Input:

```
5 2
2 -1 3 4 -5
```

Output:

```
7
```

The best two consecutive readings are `3` and `4`, summing to `7`.

## Example 2

Input:

```
4 2
-5 -2 -7 -1
```

Output:

```
-7
```

Every window loses power; the least bad pair is `-5, -2` with total `-7`.
