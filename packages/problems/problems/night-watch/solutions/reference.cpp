#include <algorithm>
#include <iostream>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    long long n;
    if (!(cin >> n)) return 0;
    long long take = 0, skip = 0;
    for (long long i = 0; i < n; ++i) {
        long long x;
        cin >> x;
        long long ntake = skip + x;
        long long nskip = max(skip, take);
        take = ntake;
        skip = nskip;
    }
    cout << max(take, skip) << "\n";
    return 0;
}
