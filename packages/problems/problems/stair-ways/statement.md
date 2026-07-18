# Stairwell Sprint

A courier climbs a stairwell of `n` steps. On each move they take either `1` or
`2` steps. Count the number of **distinct sequences of moves** that land exactly
on step `n`.

Because the count grows quickly, print it modulo `1_000_000_007`.

## Input

- A single integer `n` (`0 ≤ n ≤ 1_000_000`).

## Output

The number of distinct climbing sequences, taken modulo `1_000_000_007`.

## Example

Input:

```
4
```

Output:

```
5
```

The five sequences are `1+1+1+1`, `1+1+2`, `1+2+1`, `2+1+1`, and `2+2`. Note that
`n = 0` has exactly one sequence: the empty climb.
