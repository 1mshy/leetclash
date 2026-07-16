#include <algorithm>
#include <cstdint>
#include <iostream>
#include <vector>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    long long n;
    if (!(cin >> n)) return 0;
    vector<long long> tails;
    tails.reserve(static_cast<size_t>(n));
    for (long long i = 0; i < n; ++i) {
        long long x;
        cin >> x;
        auto it = lower_bound(tails.begin(), tails.end(), x);
        if (it == tails.end()) tails.push_back(x);
        else *it = x;
    }
    cout << tails.size() << "\n";
    return 0;
}
