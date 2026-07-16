import sys
from itertools import groupby


def main() -> None:
    s = sys.stdin.readline().strip()
    comp = "".join(f"{ch}{sum(1 for _ in grp)}" for ch, grp in groupby(s))
    print(comp if len(comp) < len(s) else s)


if __name__ == "__main__":
    main()
