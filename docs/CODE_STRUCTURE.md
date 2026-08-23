# Code structure and change rules

The codebase is deliberately small enough to review without generated framework code. Pure decision logic lives in `app/core.mjs`; browser side effects stay in adapters and `main.mjs`; the server has no third-party runtime package dependency.

When adding a feature, keep one directional dependency: `main -> adapters/core`, never `core -> DOM/network`. New commands or claim wording require unit tests. New external origins require a deliberate CSP update and a security note. New camera or microphone behavior must remain user-initiated and documented.

A POC/MVP change should prefer deletion or a small adapter over a new framework. Add infrastructure only when a measured or user-visible need justifies it.
