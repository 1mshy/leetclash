import sys


def main() -> None:
    s = sys.stdin.readline().rstrip("\n")
    opens = set("([{")
    match = {")": "(", "]": "[", "}": "{"}
    stack: list[str] = []
    depth = 0
    maxd = 0
    for c in s:
        if c in opens:
            stack.append(c)
            depth += 1
            if depth > maxd:
                maxd = depth
        elif c in match:
            if not stack or stack[-1] != match[c]:
                print(-1)
                return
            stack.pop()
            depth -= 1
    print(-1 if stack else maxd)


if __name__ == "__main__":
    main()
