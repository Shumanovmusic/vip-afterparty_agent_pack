# Stake Docs — Local Documentation Library

This directory contains downloaded Stake Engine documentation and extracted compliance requirements.

## Source URLs

See `SOURCE_URLS.txt` for the list of fetched pages.

**Sync command:** `bash scripts/sync_stake_docs.sh`

---

## API Documentation (Downloaded)

### Getting Started
- [stake_docs_index.md](library/api/stake_docs_index.md) — Main docs index

### Approval Guidelines
- [approval_guidelines.md](library/api/approval_guidelines.md) — General requirements
- [approval_frontend_communication.md](library/api/approval_frontend_communication.md) — Frontend/UI requirements
- [approval_rgs_communication.md](library/api/approval_rgs_communication.md) — RGS/session requirements
- [approval_jurisdiction_requirements.md](library/api/approval_jurisdiction_requirements.md) — US social casino language requirements
- [approval_general_disclaimer.md](library/api/approval_general_disclaimer.md) — Disclaimer requirements

### RGS (Remote Game Server)
- [rgs.md](library/api/rgs.md) — RGS overview, URL structure, currencies
- [rgs_wallet.md](library/api/rgs_wallet.md) — Wallet endpoints (authenticate, play, end-round)
- [rgs_example.md](library/api/rgs_example.md) — Basic RGS example

### Math SDK
- [math.md](library/api/math.md) — Math SDK overview
- [math_setup.md](library/api/math_setup.md) — Setup (Python, Rust/Cargo)
- [math_quick_start.md](library/api/math_quick_start.md) — Quick start guide
- [math_optimization_algorithm.md](library/api/math_optimization_algorithm.md) — Optimization algorithm
- [math_game_format.md](library/api/math_game_format.md) — Game format structure
- [math_outputs.md](library/api/math_outputs.md) — Output files

### Frontend SDK
- [front_end.md](library/api/front_end.md) — Frontend SDK (PixiJS/Svelte)

---

## Local References
- [references/smells_like_crypto_reference_analysis.md](library/references/smells_like_crypto_reference_analysis.md) — UX reference

---

## Extracted Requirements
- [extracted/COMPLIANCE_CHECKLIST.md](extracted/COMPLIANCE_CHECKLIST.md) — MUST/MUST NOT rules
- [extracted/PIPELINE_GATES.md](extracted/PIPELINE_GATES.md) — CI/dev gate commands
