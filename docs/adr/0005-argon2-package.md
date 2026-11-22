# ADR 0005 — argon2id via @node-rs/argon2 (prebuilt native bindings)

**Status:** accepted (2026-11-21)
**Context:** Spec Section 10 requires argon2id password hashing. The `argon2` npm package downloads prebuilt binaries via a postinstall script (node-gyp fallback), which is fragile in restricted environments; `@node-rs/argon2` ships the same argon2id algorithm as N-API prebuilt binaries distributed through npm's optional-dependency mechanism (no postinstall).
**Decision:** Use `@node-rs/argon2` with explicit `algorithm: Algorithm.Argon2id`, memoryCost 19 MiB, timeCost 2, parallelism 1 (OWASP-aligned defaults).
**Consequences:** Hash format is standard PHC argon2id (`$argon2id$...`), so hashes remain portable to any compliant implementation. No build toolchain required on install.
