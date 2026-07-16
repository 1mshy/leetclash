import sys


def main() -> None:
    data = sys.stdin.buffer.read().split()
    s = data[1].decode() if len(data) > 1 else ""
    match = {")": "(", "]": "[", "}": "{"}
    stack: list[str] = []
    ok = True
    for c in s:
        if c in "([{":
            stack.append(c)
        elif not stack or stack.pop() != match[c]:
            ok = False
            break
    print("YES" if ok and not stack else "NO")


if __name__ == "__main__":
    main()
