# Stake Engine Compliance Checklist

Extracted from: `stake_docs/library/api/*.md`

---

## 1. General Requirements (approval_guidelines.md)

### MUST
- [ ] Game is finalized and ready for publication before submission
- [ ] Game includes short blurb describing theme and mechanics
- [ ] Game is an original design (not pre-purchased/licensed)
- [ ] Game assets are unique (no SDK sample assets)

### MUST NOT
- [ ] Include jackpots, gamble features, continuation, or early cashout (games are **stateless**)
- [ ] Infringe on intellectual property/copyright
- [ ] Include Stake™ branding or themes in assets
- [ ] Include offensive, explicit, or poor taste content
- [ ] Include content appealing to underage persons or child-like characters

---

## 2. Frontend & UI (approval_frontend_communication.md)

### Game Display — MUST
- [ ] Use unique audio and visual assets (no SDK samples)
- [ ] Be free of visual bugs, broken/missing assets or animations
- [ ] Support mini-player/popout view without distortion
- [ ] Support mobile view with all UI functionality usable during scaling
- [ ] Load all images and fonts from Stake Engine CDN only

### Rules & Paytable — MUST
- [ ] Game rules accessible from UI with detailed description
- [ ] If multiple modes: describe cost of each bet and actions purchased
- [ ] RTP clearly communicated (for each mode if applicable)
- [ ] Maximum win amount clearly displayed (for each mode)
- [ ] Payout amounts for all symbol combinations presented
- [ ] Special symbols (cash prizes, multipliers): list all obtainable values
- [ ] Feature modes: describe how to access them (e.g., "3 Scatters award 10 free spins")

### UI Components — MUST
- [ ] Include UI guide describing button functionality
- [ ] Allow players to change bet size
- [ ] Support all bet-levels from RGS auth response
- [ ] Display player's current balance
- [ ] Show final win amounts clearly for non-zero payouts
- [ ] For multiple winning actions: payout incrementally updates to final amount
- [ ] Include option to disable sounds
- [ ] Map spacebar to bet button
- [ ] If autoplay: require player confirmation (no auto-consecutive bets with one click)
- [ ] If fastplay: wins, winning combinations, and popups still legible

### MUST NOT
- [ ] Log errors or game information to network/console
- [ ] Download fonts or assets from external servers (XSS policy)

---

## 3. RGS Communication (approval_rgs_communication.md, rgs_wallet.md)

### Authentication — MUST
- [ ] Call `/wallet/authenticate` before any other wallet endpoint
- [ ] Respect bet levels from authenticate response
- [ ] Use `minBet`, `maxBet`, `stepBet` from config
- [ ] Respect minimum/maximum bet levels per currency
- [ ] Use `rgs_url` query parameter (not hardcoded)

### Session Flow — MUST
- [ ] Handle `ERR_IS` (invalid session) gracefully
- [ ] Handle `ERR_IPB` (insufficient balance) gracefully
- [ ] Handle `ERR_MAINTENANCE` gracefully
- [ ] Continue unfinished rounds if `round` is active in auth response

### Money Format — MUST
- [ ] Use integer values with 6 decimal places (1,000,000 = $1.00)
- [ ] Display currencies per format table in rgs.md

### MUST NOT
- [ ] Reach external sources (strict XSS policy)
- [ ] Hardcode RGS URL

---

## 4. Jurisdiction / Social Casino (approval_jurisdiction_requirements.md)

For stake.us (US social casino), use `social=true` query param.

### MUST
- [ ] Use replacement phrases when `social=true`:

| Restricted | Replacement |
|------------|-------------|
| bet/bets | play/plays |
| stake | play amount |
| total bet | total play |
| pay/pays/paid | win/wins/won |
| payout/paid out | win/won |
| cash/money | coins |
| buy/bought/purchase | play / instantly triggered |
| bonus buy | bonus / feature |
| gamble/wager | play |
| deposit | get coins |
| withdraw | redeem |
| credit | coins |
| currency | token |

- [ ] Use separate language file with `sweeps_<lang>` prefix for social mode

---

## 5. Math SDK (math_setup.md)

### Dependencies — MUST
- [ ] Python 3.12+
- [ ] PIP
- [ ] Rust/Cargo (if using optimization algorithm)

### Simulation — MUST
- [ ] Validate math file format per Stake requirements
- [ ] Run simulations with reproducible seed
- [ ] Cap never exceeded in any simulation

---

## 6. Error Handling (rgs.md, rgs_wallet.md)

### Client Errors (400) — MUST Handle
| Code | Description |
|------|-------------|
| `ERR_VAL` | Invalid Request |
| `ERR_IPB` | Insufficient Player Balance |
| `ERR_IS` | Invalid Session Token / Timeout |
| `ERR_ATE` | Failed Authentication / Token Expired |
| `ERR_GLE` | Gambling Limits Exceeded |
| `ERR_LOC` | Invalid Player Location |

### Server Errors (500) — MUST Handle
| Code | Description |
|------|-------------|
| `ERR_GEN` | General Server Error |
| `ERR_MAINTENANCE` | RGS Under Planned Maintenance |

---

## 7. VIP Afterparty Specific (Local Laws)

Per `LAWS_INDEX.md` and local contracts:

### MUST
- [ ] All wins capped at `MAX_WIN_TOTAL_X = 25000` (CONFIG.md)
- [ ] Anticipation only when mathematically valid (GAME_RULES.md)
- [ ] Production RNG: cryptographically secure, no fixed seed (RNG_POLICY.md)
- [ ] Test RNG: deterministic with logged seed (RNG_POLICY.md)
- [ ] Events emitted in order per protocol_v1.md
- [ ] X-Player-Id header validated on all game endpoints

### MUST NOT
- [ ] Invent mechanics, fields, triggers, thresholds, or endpoints
- [ ] Fake anticipation visuals for impossible outcomes
