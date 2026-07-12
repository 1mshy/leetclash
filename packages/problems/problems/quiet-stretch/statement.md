# Quiet Stretch

The night librarian logs a noise reading every minute. Reading `a_i` is a
non-negative integer — how many decibel-points above silence minute `i` was.
The librarian can tolerate at most `S` total noise-points before losing focus,
and wants to know the longest run of **consecutive** minutes whose readings sum
to at most `S`. That run is the longest quiet stretch of the night.

Find the maximum length of a contiguous block of readings whose sum does not
exceed `S`. If even a single minute always exceeds the budget on its own, the
answer is `0`.

## Input

- Line 1: two integers `n` and `S` — the number of readings and the noise budget.
- Line 2: `n` integers `a_1 ... a_n` — the readings.

## Output

A single integer: the length of the longest contiguous block with sum `<= S`.

## Constraints

- `1 <= n <= 200000`
- `0 <= S <= 10^14`
- `0 <= a_i <= 10^9`

## Example 1

Input:

```
7 8
2 3 1 2 4 3 0
```

Output:

```
4
```

Minutes 1 through 4 give `2 + 3 + 1 + 2 = 8`, which uses the budget exactly.
No block of 5 consecutive minutes stays within 8.

## Example 2

Input:

```
5 3
4 4 4 4 4
```

Output:

```
0
```

Every single reading already exceeds the budget of 3, so no non-empty block
qualifies.
