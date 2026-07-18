# Patrol Window

A guard reviews `n` sensor readings taken along a fence line and must report the
strongest stretch of exactly `k` consecutive sensors.

Given the readings, find the **maximum possible sum** of any contiguous block of
exactly `k` readings.

## Input

- Line 1: two integers `n` and `k` (`1 ≤ k ≤ n ≤ 100000`).
- Line 2: `n` integers `a_1 … a_n`, each between `-1000` and `1000`.

## Output

A single integer: the maximum sum taken over every length-`k` window.

## Example

Input:

```
5 2
1 2 3 4 5
```

Output:

```
9
```

The window `[4, 5]` has the largest sum, `9`. Note that readings may be negative,
so the answer is not always the sum of the largest values.
