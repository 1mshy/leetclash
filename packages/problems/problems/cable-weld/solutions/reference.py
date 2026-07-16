import heapq
import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    n = int(data[0])
    a = [int(x) for x in data[1:1 + n]]
    if n == 1:
        print(0)
        return
    heapq.heapify(a)
    total = 0
    while len(a) > 1:
        x = heapq.heappop(a)
        y = heapq.heappop(a)
        total += x + y
        heapq.heappush(a, x + y)
    print(total)


if __name__ == "__main__":
    main()
