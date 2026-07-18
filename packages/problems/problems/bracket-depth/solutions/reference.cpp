#include <iostream>
#include <string>
using namespace std;

int main() {
    string s;
    getline(cin, s);
    while (!s.empty() && (s.back() == '\n' || s.back() == '\r')) s.pop_back();

    string stack;
    long long depth = 0, maxd = 0;
    for (char c : s) {
        if (c == '(' || c == '[' || c == '{') {
            stack.push_back(c);
            depth++;
            if (depth > maxd) maxd = depth;
        } else if (c == ')' || c == ']' || c == '}') {
            char need = c == ')' ? '(' : (c == ']' ? '[' : '{');
            if (stack.empty() || stack.back() != need) {
                cout << -1 << "\n";
                return 0;
            }
            stack.pop_back();
            depth--;
        }
    }
    cout << (stack.empty() ? maxd : -1) << "\n";
    return 0;
}
