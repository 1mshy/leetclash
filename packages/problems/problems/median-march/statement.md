# Caravan Rally

The great salt road through the Kessarin desert is one straight line of mile
markers, numbered from `0` onward. Tonight `n` trading caravans are camped
along it, the `i`-th at integer marker `a_i` (several caravans may share a
marker). At dawn a sandstorm council was called: every caravan must gather at
**one single mile marker** before the storm front arrives.

Camels are stubborn and water is scarce, so moving one caravan by one mile
costs exactly one waterskin, in either direction. The caravan masters may pick
any integer marker as the rally point — it does not have to be a marker where
someone is already camped.

Compute the minimum total number of waterskins needed to bring every caravan
to a common rally point.

## Input

- Line 1: an integer `n` — the number of caravans.
- Line 2: `n` integers `a_1 ... a_n` — the mile markers of the caravans.

## Output

A single integer: the minimum total cost, in waterskins.

## Constraints

- `1 <= n <= 200000`
- `0 <= a_i <= 1000000000`
- The answer can exceed the range of a 32-bit integer.

## Example 1

Input:

```
4
2 8 4 6
```

Output:

```
8
```

Rallying at marker `4` costs `2 + 4 + 0 + 2 = 8` waterskins; no marker does
better.

## Example 2

Input:

```
4
0 0 0 100
```

Output:

```
100
```

The lone far caravan walks the whole way to marker `0`; meeting anywhere
between the camps only adds cost for the three caravans already together.
