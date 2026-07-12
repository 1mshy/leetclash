# Language runtime images (Phase 3 placeholder)

Empty on purpose. Phase 3 replaces the Judge0 quartet with custom
isolate-based judge workers, and this directory will hold one pinned Dockerfile
per launch language (PLAN.md §4.3):

- Python 3.12
- Node 22
- C++ (g++ 14)
- Java 21
- Go 1.23
- Rust stable

Each image = compiler/interpreter + isolate + tini, nothing else. Per-language
time/memory multipliers live with each problem, not here. No Dockerfiles yet.
