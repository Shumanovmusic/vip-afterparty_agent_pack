# CONFIG CONTRACT (Source of Truth)

Этот файл — единый источник правды по флагам и ключевым числам.
Если параметра нет здесь — агент не имеет права его "угадать".

## Math
MAX_WIN_TOTAL_X=25000

## RTP Targets (Audit Acceptance Criteria)
# These are simulation-verified targets with tolerance bands

# Base Game RTP
TARGET_RTP_BASE=98.0
TARGET_RTP_TOLERANCE_20K=2.0   # ±2.0% for 20k rounds (gate tests)
TARGET_RTP_TOLERANCE_100K=2.5  # ±2.5% for 100k rounds
TARGET_RTP_TOLERANCE_1M=1.0    # ±1.0% for 1M rounds (precision audit)
# Meaning: base game RTP should be ~98.0% with tolerance based on sample size

# Buy Feature Mode
BUY_FEATURE_COST_MULTIPLIER=100  # Buy costs 100x base bet
TARGET_RTP_BUY=98.0
# NOTE: Buy mode RTP is calculated as: total_won / (rounds * bet * 100)

# Hype Mode (Ante Bet) - WAGER-BASED RTP
# Per GAME_RULES.md: hype mode costs 1.25x base bet but payouts are on base bet only.
# This is intentional: players trade EV for higher bonus entry frequency.
# Wager-based RTP = payout / total_wagered = base_rtp / (1 + HYPE_MODE_COST_INCREASE)
# With base=98.0 and cost_increase=0.25: TARGET_RTP_HYPE = 98.0 / 1.25 = 78.4
TARGET_RTP_HYPE=78.4

# Fast Audit Parameters (for gate tests)
TARGET_RTP_ROUNDS_FAST=20000
TARGET_RTP_SEED=AUDIT_2025

## Bonus Buy / VIP Enhanced Bonus (CONTRACT)
BUY_FEATURE_COST_MULTIPLIER=100
ENABLE_VIP_BUY_BONUS_VARIANT=ON
BUY_BONUS_PAYOUT_MULTIPLIER=11

TARGET_BONUS_ENTRY_RATE=0.50
TARGET_BONUS_ENTRY_TOLERANCE=0.30
# Meaning: bonus entry rate should be ~0.5% ± 0.3% (0.2% - 0.8%) ~ 1 in 125-500 spins

# Tail Distribution (dream wins)
MIN_OBSERVABLE_WIN_X=500
# Meaning: in 100k+ round simulation, we expect to observe at least one 500x+ win
# NOTE: 1000x+ and 10000x+ wins are rare; may not appear in 100k rounds

# Tail Gate Testing
TAIL_GATE_ROUNDS_BUY=50000
# Number of rounds for tail gate test in buy mode
# Must be high enough to observe 1000x+ wins (or ISSUE.md if tail unreachable)

# Extended Tail Gate (GATE 4: Cap Reachability)
TAIL_GATE_ROUNDS_BUY_EXTENDED=200000
# Number of rounds for extended tail gate (10k+ and cap reachability)

# Tail Targets (per 50k or 200k rounds) - these are MINIMUMS for gate pass
TAIL_TARGET_1000X_PLUS_BUY_MIN_PER_50K=1
# Meaning: at least 1 win >=1000x per 50k buy mode rounds (or gate fails)

TAIL_TARGET_10000X_PLUS_BUY_MIN_PER_50K=0
# Meaning: 10k+ wins are extremely rare; may be 0 in 50k rounds without failure
# However, in 200k rounds, we expect at least 1 (see TAIL_GATE_ROUNDS_BUY_EXTENDED)

TAIL_TARGET_CAPPED_BUY_MIN_PER_200K=0
# Meaning: cap hits (25000x) may be 0 even in 200k rounds; reachability via proof allowed

# Cap Reachability Strategy
CAP_REACHABILITY_STRATEGY=seed
# Options: "seed" (find actual seed hitting 10k+) or "proof" (formal reachability doc)
# If strategy=seed and no 10k+ seed found within budget, gate fails unless CAP_REACHABILITY.md exists
# If strategy=proof, CAP_REACHABILITY.md MUST exist and contain formal reachability analysis

## UX / Animation
POST_SPIN_BOUNCE_DEFAULT=ON
REDUCE_MOTION_DEFAULT=OFF
TURBO_SPIN_DEFAULT=OFF
ALLOW_SKIP_ANIMATIONS=ON

## Engagement / Anticipation
ANTICIPATION_ENABLED_DEFAULT=ON
ANTICIPATION_MAX_RATE_PER_100_SPINS=12

## Engagement Features (NEW)
ENABLE_HYPE_MODE_ANTE_BET=ON
HYPE_MODE_COST_INCREASE=0.25

# MUST: This multiplier applies to PER-CELL scatter probability (e.g., 2% → 4%).
# Due to binomial distribution (3+ scatters in 15 cells), actual bonus entry rate
# increase is non-linear: ~5-7x for a 2x per-cell multiplier. This is intended.
HYPE_MODE_BONUS_CHANCE_MULTIPLIER=2.0

# Grid parameters (for reference - used in bonus entry rate calculation)
GRID_CELLS=15
BONUS_TRIGGER_SCATTERS=3
BASE_SCATTER_CHANCE=0.02

## Base Game Modifiers
ENABLE_SPOTLIGHT_WILDS=ON
SPOTLIGHT_WILDS_FREQUENCY=0.05  # ~ раз в 20 спинов

## Afterparty Meter (Canonical Rage System)
# The meter fills during play; when full, triggers Afterparty Rage Mode.
# This is the PRIMARY rage mechanic for "VIP Afterparty" game.
# RTP Impact: Rage x2 during 3 spins adds ~2-3% RTP; calibrated to fill slowly.
ENABLE_AFTERPARTY_METER=ON
AFTERPARTY_METER_MAX=100
AFTERPARTY_RAGE_SPINS=3
AFTERPARTY_RAGE_MULTIPLIER=2
AFTERPARTY_METER_INC_ON_ANY_WIN=3
AFTERPARTY_METER_INC_ON_WILD_PRESENT=5
AFTERPARTY_METER_INC_ON_TWO_SCATTERS=8
AFTERPARTY_RAGE_COOLDOWN_SPINS=15

# Afterparty Rage visuals (frontend must respect these)
AFTERPARTY_UI_BANNER=ON
AFTERPARTY_VFX_INTENSITY=2
AFTERPARTY_SCREEN_SHAKE=ON


## Events / Variety Layer (BOOST + EXPLOSIVE only)
# NOTE: Rage is handled by Afterparty Meter above, NOT by Event System.
EVENT_SYSTEM_DEFAULT=ON

BOOST_MODE_DEFAULT=ON
EXPLOSIVE_MODE_DEFAULT=ON

# Limits (rate limiting per 100 spins)
EVENT_MAX_RATE_PER_100_SPINS=18
BOOST_MAX_RATE_PER_100_SPINS=8
EXPLOSIVE_MAX_RATE_PER_100_SPINS=10

# Triggers (deterministic rules)
BOOST_TRIGGER_SMALLWINS=4
EXPLOSIVE_TRIGGER_WIN_X=5

# Durations
BOOST_SPINS=3
EXPLOSIVE_SPINS=1
