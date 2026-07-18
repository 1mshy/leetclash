#include <iostream>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    long long n;
    if (!(cin >> n)) return 0;
    const long long MOD = 1000000007;
    if (n <= 1) {
        cout << 1 << "\n";
        return 0;
    }
    long long a = 1, b = 1;
    for (long long i = 2; i <= n; i++) {
        long long c = (a + b) % MOD;
        a = b;
        b = c;
    }
    cout << b << "\n";
    return 0;
}
