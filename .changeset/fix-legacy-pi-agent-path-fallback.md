---
"@dustinbyrne/kb": patch
---

Fix kb engine agent path resolution by falling back to legacy `~/.pi/*.json` files when `~/.pi/agent/*.json` is absent, so existing pi auth/models/settings continue to work.
