import sys


def main() -> None:
    # WRONG: tracks depth but never validates matching/order, so it reports a
    # depth for invalid packings instead of -1.
    s = sys.stdin.readline().rstrip("\n")
    depth = 0
    maxd = 0
    for c in s:
        if c in "([{":
            depth += 1
            if depth > maxd:
                maxd = depth
        elif c in ")]}":
            depth -= 1
    print(maxd)


if __name__ == "__main__":
    main()
