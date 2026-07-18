import random
import sys

# Usage: generator.py <seed> <small|medium|large>
seed = int(sys.argv[1])
tier = sys.argv[2] if len(sys.argv) > 2 else "small"
random.seed(seed)

RANGES = {"small": (0, 30), "medium": (1000, 5000), "large": (500000, 1000000)}
lo, hi = RANGES.get(tier, (0, 30))
print(random.randint(lo, hi))
