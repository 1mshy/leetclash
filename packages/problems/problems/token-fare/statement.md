# Token Fare

The funicular up to Bellhaven Gate has never seen a banknote. Its ancient
turnstile swallows only brass tokens, minted in `k` different denominations,
and the fare board above it shows today's price: exactly `F` brass units.

The kiosk beside the platform sells any number of tokens of every denomination,
so supply is not the issue. The turnstile is. Its coin slot is so stiff and
slow that every extra token fed into it is a small act of penance, and it gives
no change — the tokens dropped in must add up to the fare precisely, not a unit
more or less.

Given the denominations, find the smallest number of tokens whose values sum to
exactly `F`. If no combination of tokens can hit the fare exactly, print `-1`
so the operator knows to wave you through the side gate.

## Input

- Line 1: two integers `k` and `F` — the number of denominations and the fare.
- Line 2: `k` distinct integers `d_1 ... d_k` — the token denominations.

## Output

A single integer: the minimum number of tokens that pay exactly `F`, or `-1` if
it is impossible. Note that `F = 0` is paid with `0` tokens.

## Constraints

- `1 <= k <= 12`
- `0 <= F <= 100000`
- `1 <= d_i <= 100000`, all `d_i` distinct

## Example 1

Input:

```
3 6
1 3 4
```

Output:

```
2
```

Two 3-unit tokens pay the fare; starting with the 4-unit token would force
`4 + 1 + 1`, which uses three.

## Example 2

Input:

```
2 7
2 4
```

Output:

```
-1
```

Every combination of 2s and 4s is even, so an odd fare of 7 can never be paid
exactly.
