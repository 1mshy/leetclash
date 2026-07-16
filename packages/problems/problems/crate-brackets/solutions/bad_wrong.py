# Plausibly-wrong solution: only verifies that each opening bracket type
# appears exactly as often as its closing counterpart, ignoring order and
# nesting entirely — so strings like ")(" and "([)]" are wrongly accepted.
import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    s = data[1].decode() if len(data) > 1 else ""
    ok = (
        s.count("(") == s.count(")")
        and s.count("[") == s.count("]")
        and s.count("{") == s.count("}")
    )
    print("YES" if ok else "NO")


if __name__ == "__main__":
    main()
