#include <iostream>
#include <string>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    string s;
    if (!(cin >> s)) return 0;
    string comp;
    comp.reserve(s.size());
    size_t i = 0;
    while (i < s.size()) {
        size_t j = i;
        while (j < s.size() && s[j] == s[i]) ++j;
        comp += s[i];
        comp += to_string(j - i);
        i = j;
    }
    cout << (comp.size() < s.size() ? comp : s) << "\n";
    return 0;
}
