# River Ferry

Old Odo runs the only ferry across the Greel, a flat-bottomed barge winched
along a rope strung between the two banks. Market day is over, and `n` crates
of unsold goods are stacked on the near shore, the `i`-th weighing `w_i`
stone. Every crate must end up on the far bank before sundown.

The barge is small and the rope is old. On any single crossing Odo can load
**at most two crates**, and their combined weight must not exceed the rope's
rated limit `W`. No single crate exceeds `W` on its own, so everything can be
moved eventually — the question is how quickly. Hauling the empty barge back
is done by the winch overnight, so only loaded crossings count toward Odo's
day of work.

Tell Odo the minimum number of loaded crossings needed to move all `n` crates.

## Input

- Line 1: two integers `n` and `W` — the number of crates and the weight limit
  per crossing.
- Line 2: `n` integers `w_1 ... w_n` — the crate weights.

## Output

A single integer: the minimum number of crossings.

## Constraints

- `1 <= n <= 200000`
- `1 <= W <= 1000000000`
- `1 <= w_i <= W`

## Example 1

Input:

```
4 5
1 2 3 4
```

Output:

```
2
```

Ship crates of weight 1 and 4 together, then 2 and 3 together; pairing
neighbours by weight (1 with 2, leaving 3 and 4 to travel alone) would need 3.

## Example 2

Input:

```
3 6
3 5 2
```

Output:

```
2
```

The 5-stone crate cannot share the barge with anything (`5 + 2 > 6`), so it
crosses alone; the crates of weight 3 and 2 share the second crossing.
