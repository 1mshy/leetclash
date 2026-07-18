import random
import sys

# Usage: generator.py <seed> <small|medium|large>. Emits a valid balanced string.
seed = int(sys.argv[1])
tier = sys.argv[2] if len(sys.argv) > 2 else "small"
random.seed(seed)

PAIRS = {"small": 6, "medium": 1000, "large": 50000}
pairs = PAIRS.get(tier, 6)

opens = ["(", "[", "{"]
close = {"(": ")", "[": "]", "{": "}"}
seq: list[str] = []
stack: list[str] = []
to_open = pairs
while to_open > 0 or stack:
    if to_open > 0 and (not stack or random.random() < 0.6):
        o = random.choice(opens)
        seq.append(o)
        stack.append(o)
        to_open -= 1
    else:
        seq.append(close[stack.pop()])

print("".join(seq))
