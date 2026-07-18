import random
import sys

# Usage: generator.py <seed> <small|medium|large>
seed = int(sys.argv[1])
tier = sys.argv[2] if len(sys.argv) > 2 else "small"
random.seed(seed)

SIZES = {"small": 12, "medium": 2000, "large": 100000}
n = SIZES.get(tier, 12)
k = random.randint(1, n)
vals = [random.randint(-1000, 1000) for _ in range(n)]

print(n, k)
print(" ".join(str(v) for v in vals))
