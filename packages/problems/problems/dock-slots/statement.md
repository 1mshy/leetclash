# Dock Master

Saltmere pier has exactly one loading dock, and every captain on the coast
wants it. This morning `n` booking requests landed on the dock master's desk.
Request `i` asks to occupy the dock from time `s_i` up to but not including
time `e_i` — the crew casts off precisely at `e_i`, so a following booking may
begin exactly at that moment.

The dock master cannot shorten, split, or shift a booking: each request is
either served exactly as written or turned away. Two served bookings must
never occupy the dock at the same time, though one may start at the very
instant the previous one ends.

Captains grumble no matter what, so the dock master has a simple goal: serve
as many bookings as possible. Compute that maximum.

## Input

- Line 1: an integer `n` — the number of booking requests.
- Next `n` lines: two integers `s_i` and `e_i` — the start and end of the
  `i`-th request (the dock is held during `[s_i, e_i)`).

## Output

A single integer: the maximum number of bookings that can be served.

## Constraints

- `1 <= n <= 200000`
- `0 <= s_i < e_i <= 1000000000`

## Example 1

Input:

```
3
0 10
1 3
4 6
```

Output:

```
2
```

Turning away the long booking `[0, 10)` lets the dock serve both `[1, 3)` and
`[4, 6)`.

## Example 2

Input:

```
4
1 3
3 5
2 6
5 7
```

Output:

```
3
```

Serve `[1, 3)`, `[3, 5)` and `[5, 7)` — each one starts exactly when the
previous crew casts off, which is allowed.
