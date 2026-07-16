# Dockside Whispers

Word travels fast on the docks. The harbormaster needs every one of the `n` dock
workers to hear about tomorrow's early tide, and she knows exactly how gossip
works here: the moment one worker hears something, it spreads through every chain
of friendships until the whole friendship circle knows.

The union roster lists `m` friendship pairs. Friendships are mutual, the same
pair may appear on the roster more than once, and plenty of workers keep to
themselves and have no friends at all — those loners each form a circle of one.
The harbormaster must walk the pier and tell the news **directly** to exactly one
worker per friendship circle. Count how many workers she has to talk to — that
is, count the friendship circles (connected components of the friendship graph).

## Input

- Line 1: two integers `n` and `m` — the number of workers and the number of
  roster entries.
- Next `m` lines: two integers `u` and `v` (`u != v`) — workers `u` and `v` are
  friends. Workers are numbered `1` through `n`; pairs may repeat.

## Output

A single integer: the number of friendship circles.

## Constraints

- `1 <= n <= 200000`
- `0 <= m <= 200000`

## Example 1

Input:

```
6 4
1 2
2 3
3 1
4 5
```

Output:

```
3
```

The circles are `{1, 2, 3}` (the third friendship closes a loop but merges
nothing new), `{4, 5}`, and the friendless worker `{6}`.

## Example 2

Input:

```
4 0
```

Output:

```
4
```

Nobody is friends with anybody, so all four workers must be told directly.
