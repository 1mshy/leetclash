#include <iostream>
#include <string>
#include <vector>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    long long n;
    string s;
    if (!(cin >> n >> s)) return 0;
    vector<char> st;
    st.reserve(s.size());
    bool ok = true;
    for (char c : s) {
        if (c == '(' || c == '[' || c == '{') {
            st.push_back(c);
        } else {
            char want = c == ')' ? '(' : (c == ']' ? '[' : '{');
            if (st.empty() || st.back() != want) {
                ok = false;
                break;
            }
            st.pop_back();
        }
    }
    if (!st.empty()) ok = false;
    cout << (ok ? "YES" : "NO") << "\n";
    return 0;
}
