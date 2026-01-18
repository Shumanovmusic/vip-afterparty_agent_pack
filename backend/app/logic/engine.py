"""Game engine per GAME_RULES.md, EVENT_SYSTEM.md, and CONFIG.md."""
from typing import Any

from app.config import settings
from app.logic.models import GameMode, GameState, SpinResult, Symbol
from app.logic.rng import ProductionRNG, RNGBase, SeededRNG
from app.protocol import SpinMode


# === CONFIG VALUES (from CONFIG.md via settings) ===
# MAX_WIN_TOTAL_X is derived from settings, not hardcoded
MAX_WIN_TOTAL_X = settings.max_win_total_x

# Spotlight Wilds
ENABLE_SPOTLIGHT_WILDS = True
SPOTLIGHT_WILDS_FREQUENCY = 0.05
SPOTLIGHT_WILDS_MIN_POS = 1
SPOTLIGHT_WILDS_MAX_POS = 3

# Hype Mode
HYPE_MODE_COST_INCREASE = 0.25
HYPE_MODE_BONUS_CHANCE_MULTIPLIER = 2.0

# Free Spins Enhancement (Buy Feature only)
# To achieve ~96% RTP on 100x Buy Feature cost:
# - 10 spins × base RTP (~0.96x) = ~9.6x total
# - Need ~96x total for 96% RTP on 100x cost
# - Empirical calibration: 11x multiplier yields ~95% RTP
FREE_SPINS_WIN_MULTIPLIER = 11

# Afterparty Meter (Canonical Rage System - meter-based, NOT deadspins)
# RTP Impact: Rage x2 multiplier during 3 spins adds ~2-3% RTP when triggered
# All tuned values are read from settings (derived from CONFIG.md)
ENABLE_AFTERPARTY_METER = settings.enable_afterparty_meter
AFTERPARTY_METER_MAX = settings.afterparty_meter_max
AFTERPARTY_RAGE_SPINS = settings.afterparty_rage_spins
AFTERPARTY_RAGE_MULTIPLIER = settings.afterparty_rage_multiplier
AFTERPARTY_METER_INC_ON_ANY_WIN = settings.afterparty_meter_inc_on_any_win
AFTERPARTY_METER_INC_ON_WILD_PRESENT = settings.afterparty_meter_inc_on_wild_present
AFTERPARTY_METER_INC_ON_TWO_SCATTERS = settings.afterparty_meter_inc_on_two_scatters
AFTERPARTY_RAGE_COOLDOWN_SPINS = settings.afterparty_rage_cooldown_spins

# Event triggers (BOOST + EXPLOSIVE only; Rage is handled by Afterparty Meter)
BOOST_TRIGGER_SMALLWINS = 4
EXPLOSIVE_TRIGGER_WIN_X = 5
BOOST_SPINS = 3
EXPLOSIVE_SPINS = 1

# Rate limits per 100 spins (BOOST + EXPLOSIVE only)
EVENT_MAX_RATE_PER_100_SPINS = 18
BOOST_MAX_RATE_PER_100_SPINS = 8
EXPLOSIVE_MAX_RATE_PER_100_SPINS = 10

# Win tiers
WIN_TIER_BIG = 20.0
WIN_TIER_MEGA = 200.0
WIN_TIER_EPIC = 1000.0

# Grid dimensions
REELS = 5
ROWS = 3

# Paylines (10 lines for ~96% RTP)
# Each payline is a list of row indices for each reel [reel0_row, reel1_row, ...]
PAYLINES = [
    [1, 1, 1, 1, 1],  # Line 0: middle horizontal
    [0, 0, 0, 0, 0],  # Line 1: top horizontal
    [2, 2, 2, 2, 2],  # Line 2: bottom horizontal
    [0, 1, 2, 1, 0],  # Line 3: V shape
    [2, 1, 0, 1, 2],  # Line 4: inverted V
    [0, 0, 1, 2, 2],  # Line 5: diagonal down
    [2, 2, 1, 0, 0],  # Line 6: diagonal up
    [1, 0, 0, 0, 1],  # Line 7: top curve
    [1, 2, 2, 2, 1],  # Line 8: bottom curve
    [0, 1, 1, 1, 0],  # Line 9: shallow V
]

# Scatter pay multipliers (for 3, 4, 5 scatters)
SCATTER_PAYS = {3: 2, 4: 10, 5: 50}


class GameEngine:
    """
    Game logic engine per GAME_RULES.md.

    Implements:
    - Spin resolution with symbol generation
    - Spotlight Wilds (random feature)
    - Win calculation with paylines
    - Event triggers (rage, boost, explosive)
    - Cap enforcement (MAX_WIN_TOTAL_X)
    - State transitions
    """

    def __init__(self, rng: RNGBase | None = None):
        self.rng = rng or ProductionRNG()

    def spin(
        self,
        bet_amount: float,
        mode: SpinMode,
        hype_mode: bool,
        state: GameState | None = None,
    ) -> SpinResult:
        """
        Execute a spin and return result.

        Args:
            bet_amount: Base bet amount
            mode: NORMAL or BUY_FEATURE
            hype_mode: Whether hype mode is enabled
            state: Current game state (or None for new)

        Returns:
            SpinResult with events, outcome, and next state
        """
        state = state or GameState()
        result = SpinResult(next_state=state.model_copy(deep=True))
        events: list[dict[str, Any]] = []

        # Handle BUY_FEATURE: immediately enter Free Spins mode (VIP Enhanced Bonus)
        if mode == SpinMode.BUY_FEATURE and state.mode == GameMode.BASE:
            # Buy Feature triggers VIP Free Spins with 10 spins
            result.next_state.mode = GameMode.FREE_SPINS
            result.next_state.free_spins_remaining = 10
            result.next_state.heat_level = 1
            result.next_state.bonus_is_bought = True  # Mark as VIP buy bonus (11x multiplier)
            events.append({
                "type": "enterFreeSpins",
                "count": 10,
                "reason": "buy_feature",
                "bonusVariant": "vip_buy",
            })
            events.append({"type": "heatUpdate", "level": 1})
            # Update state reference for rest of spin
            state = result.next_state

        # Calculate effective bet (hype mode adds surcharge)
        effective_cost = bet_amount
        if hype_mode:
            effective_cost = bet_amount * (1 + HYPE_MODE_COST_INCREASE)

        # Base bet for payout calculations (always base, not hype surcharge)
        base_bet = bet_amount

        # 1) Generate grid
        grid = self._generate_grid()

        # 2) Apply Spotlight Wilds (before win calculation) per GAME_RULES.md
        spotlight_positions: list[int] = []
        if ENABLE_SPOTLIGHT_WILDS and self.rng.random() < SPOTLIGHT_WILDS_FREQUENCY:
            spotlight_positions = self._apply_spotlight_wilds(grid)
            result.spotlight_used = True
            result.spotlight_positions = spotlight_positions

        result.grid = grid

        # 3) Count special symbols
        scatter_count, wild_count = self._count_specials(grid)
        result.scatter_count = scatter_count
        result.wild_count = wild_count

        # 4) Add reveal event
        events.append({"type": "reveal", "grid": grid})

        # 5) Add spotlight event if triggered
        if spotlight_positions:
            events.append({
                "type": "spotlightWilds",
                "positions": spotlight_positions,
                "count": len(spotlight_positions),
            })

        # 6) Calculate win (simplified payline logic)
        base_win, win_lines = self._calculate_win(grid, base_bet)

        # 7) Apply multipliers
        multiplier = 1

        # Buy Feature bonus: apply 10x multiplier (to achieve ~96% RTP on 100x Buy cost)
        # Only applies when bonus was triggered via Buy Feature, not natural scatter trigger
        if state.mode == GameMode.FREE_SPINS and state.bonus_is_bought:
            multiplier *= FREE_SPINS_WIN_MULTIPLIER

        # Afterparty Rage: additional 2x multiplier
        if state.rage_active and state.rage_spins_left > 0:
            multiplier *= AFTERPARTY_RAGE_MULTIPLIER

        total_win = base_win * multiplier
        total_win_x = total_win / base_bet if base_bet > 0 else 0

        # 8) Enforce MAX_WIN_TOTAL_X cap
        is_capped = False
        cap_reason = None
        if total_win_x > MAX_WIN_TOTAL_X:
            is_capped = True
            cap_reason = "max_win_base" if state.mode == GameMode.BASE else "max_win_bonus"
            total_win_x = MAX_WIN_TOTAL_X
            total_win = total_win_x * base_bet

        result.base_win = base_win
        result.total_win = total_win
        result.total_win_x = total_win_x
        result.is_capped = is_capped
        result.cap_reason = cap_reason

        # 9) Add win line events
        for win_line in win_lines:
            events.append(win_line)

        # 10) Update state and generate events
        next_state = result.next_state

        # Update afterparty meter per CONFIG.md (AFTERPARTY_* keys)
        meter_triggered = False
        if ENABLE_AFTERPARTY_METER and state.mode == GameMode.BASE and not state.rage_active:
            meter_before = next_state.afterparty_meter
            if total_win > 0:
                next_state.afterparty_meter = min(
                    next_state.afterparty_meter + AFTERPARTY_METER_INC_ON_ANY_WIN,
                    AFTERPARTY_METER_MAX,
                )
            if wild_count > 0:
                next_state.afterparty_meter = min(
                    next_state.afterparty_meter + AFTERPARTY_METER_INC_ON_WILD_PRESENT,
                    AFTERPARTY_METER_MAX,
                )
            if scatter_count == 2:
                next_state.afterparty_meter = min(
                    next_state.afterparty_meter + AFTERPARTY_METER_INC_ON_TWO_SCATTERS,
                    AFTERPARTY_METER_MAX,
                )

            # Check if meter reached max → trigger Afterparty Rage
            if (
                next_state.afterparty_meter >= AFTERPARTY_METER_MAX
                and state.rage_cooldown_remaining == 0
            ):
                meter_triggered = True
                next_state.rage_active = True
                next_state.rage_spins_left = AFTERPARTY_RAGE_SPINS
                next_state.afterparty_meter = 0  # Reset meter

            # Emit meter update event BEFORE eventStart (per EVENT_ORDER)
            if next_state.afterparty_meter != meter_before or meter_triggered:
                events.append({
                    "type": "afterpartyMeterUpdate",
                    "level": next_state.afterparty_meter,
                    "triggered": meter_triggered,
                })

            # Emit eventStart for rage AFTER meter update
            if meter_triggered:
                events.append({
                    "type": "eventStart",
                    "eventType": "afterpartyRage",
                    "reason": "meter_full",
                    "durationSpins": AFTERPARTY_RAGE_SPINS,
                    "multiplier": AFTERPARTY_RAGE_MULTIPLIER,
                })

        # Update streaks per EVENT_SYSTEM.md
        if state.mode == GameMode.BASE:
            if total_win_x == 0:
                next_state.deadspins_streak = state.deadspins_streak + 1
                next_state.smallwins_streak = 0
            elif total_win_x <= 2:
                next_state.smallwins_streak = state.smallwins_streak + 1
                next_state.deadspins_streak = 0
            else:
                next_state.deadspins_streak = 0
                next_state.smallwins_streak = 0

        # Cooldown tracking
        if state.rage_cooldown_remaining > 0:
            next_state.rage_cooldown_remaining = state.rage_cooldown_remaining - 1

        # 11) Handle Afterparty Rage mode state
        if state.rage_active:
            next_state.rage_spins_left = state.rage_spins_left - 1
            if next_state.rage_spins_left <= 0:
                next_state.rage_active = False
                next_state.afterparty_meter = 0
                next_state.rage_cooldown_remaining = AFTERPARTY_RAGE_COOLDOWN_SPINS
                events.append({"type": "eventEnd", "eventType": "afterpartyRage"})

        # 12) Check for event triggers (BOOST + EXPLOSIVE only; Rage is meter-based)
        # Rate limit check
        next_state.spins_in_window = (state.spins_in_window + 1) % 100
        can_trigger_event = state.events_in_window < EVENT_MAX_RATE_PER_100_SPINS

        # NOTE: Rage is triggered by Afterparty Meter (step 10), NOT by deadspins.

        # Boost trigger (smallwins)
        if (
            can_trigger_event
            and not state.rage_active
            and state.mode == GameMode.BASE
            and next_state.smallwins_streak >= BOOST_TRIGGER_SMALLWINS
            and state.boost_in_window < BOOST_MAX_RATE_PER_100_SPINS
        ):
            next_state.smallwins_streak = 0
            next_state.boost_in_window = state.boost_in_window + 1
            next_state.events_in_window = state.events_in_window + 1
            events.append({
                "type": "eventStart",
                "eventType": "boost",
                "reason": "smallwins",
                "durationSpins": BOOST_SPINS,
            })

        # Explosive trigger (win threshold)
        if (
            can_trigger_event
            and state.mode == GameMode.BASE
            and total_win_x >= EXPLOSIVE_TRIGGER_WIN_X
            and state.explosive_in_window < EXPLOSIVE_MAX_RATE_PER_100_SPINS
        ):
            next_state.explosive_in_window = state.explosive_in_window + 1
            next_state.events_in_window = state.events_in_window + 1
            events.append({
                "type": "eventStart",
                "eventType": "explosive",
                "reason": "win_threshold",
                "durationSpins": EXPLOSIVE_SPINS,
            })

        # 13) Check for free spins trigger (3+ scatters)
        base_scatter_chance = 0.02  # Base chance per reel position
        if hype_mode:
            base_scatter_chance *= HYPE_MODE_BONUS_CHANCE_MULTIPLIER

        if scatter_count >= 3 and state.mode == GameMode.BASE:
            free_spins_count = 10 + (scatter_count - 3) * 2  # 10 + bonus for extra
            next_state.mode = GameMode.FREE_SPINS
            next_state.free_spins_remaining = free_spins_count
            next_state.heat_level = 1
            # Natural scatter trigger - standard bonus variant (no VIP multiplier)
            events.append({
                "type": "enterFreeSpins",
                "count": free_spins_count,
                "reason": "scatter",
                "bonusVariant": "standard",
            })
            events.append({"type": "heatUpdate", "level": 1})

        # 14) Handle free spins mode
        if state.mode == GameMode.FREE_SPINS:
            next_state.free_spins_remaining = state.free_spins_remaining - 1

            # Update heat on win
            if total_win > 0 and state.heat_level < 10:
                next_state.heat_level = state.heat_level + 1
                events.append({"type": "heatUpdate", "level": next_state.heat_level})

            # Check for bonus end
            if next_state.free_spins_remaining <= 0:
                finale_path = "standard"
                if next_state.heat_level >= 10:
                    finale_path = "upgrade"
                elif total_win_x >= 20:
                    finale_path = "multiplier"

                # Build bonusEnd event with VIP fields if applicable
                bonus_end_event: dict[str, Any] = {
                    "type": "bonusEnd",
                    "bonusType": "freespins",
                    "finalePath": finale_path,
                    "totalWinX": total_win_x,
                }

                # Add VIP Buy fields per TELEMETRY.md / protocol_v1.md
                if state.bonus_is_bought:
                    # Calculate pre-multiplier win (before 11x applied)
                    pre_multiplier_win_x = total_win_x / FREE_SPINS_WIN_MULTIPLIER
                    bonus_end_event["bonusVariant"] = "vip_buy"
                    bonus_end_event["bonusMultiplierApplied"] = FREE_SPINS_WIN_MULTIPLIER
                    bonus_end_event["totalWinXPreMultiplier"] = pre_multiplier_win_x

                events.append(bonus_end_event)
                next_state.mode = GameMode.BASE
                next_state.heat_level = 0
                next_state.bonus_is_bought = False  # Reset buy flag

        # 15) Determine win tier
        win_tier = "none"
        if total_win_x >= WIN_TIER_EPIC:
            win_tier = "epic"
        elif total_win_x >= WIN_TIER_MEGA:
            win_tier = "mega"
        elif total_win_x >= WIN_TIER_BIG:
            win_tier = "big"

        result.win_tier = win_tier
        if win_tier != "none":
            events.append({
                "type": "winTier",
                "tier": win_tier,
                "winX": total_win_x,
            })

        result.events = events
        return result

    def _generate_grid(self) -> list[list[int]]:
        """Generate 5x3 grid with random symbols."""
        grid = []
        for _ in range(REELS):
            reel = []
            for _ in range(ROWS):
                # Weighted symbol selection
                r = self.rng.random()
                if r < 0.02:
                    symbol = Symbol.SCATTER.value
                elif r < 0.07:
                    symbol = Symbol.WILD.value
                elif r < 0.17:
                    symbol = Symbol.HIGH1.value
                elif r < 0.27:
                    symbol = Symbol.HIGH2.value
                elif r < 0.37:
                    symbol = Symbol.HIGH3.value
                elif r < 0.52:
                    symbol = Symbol.MID1.value
                elif r < 0.67:
                    symbol = Symbol.MID2.value
                elif r < 0.78:
                    symbol = Symbol.LOW1.value
                elif r < 0.89:
                    symbol = Symbol.LOW2.value
                else:
                    symbol = Symbol.LOW3.value
                reel.append(symbol)
            grid.append(reel)
        return grid

    def _apply_spotlight_wilds(self, grid: list[list[int]]) -> list[int]:
        """
        Apply Spotlight Wilds per GAME_RULES.md.

        Selects 1-3 random positions and converts to WILD.
        Returns list of flattened positions.
        """
        count = self.rng.randint(SPOTLIGHT_WILDS_MIN_POS, SPOTLIGHT_WILDS_MAX_POS)
        total_positions = REELS * ROWS
        positions: list[int] = []

        for _ in range(count):
            # Pick random position not already selected
            attempts = 0
            while attempts < 100:
                pos = self.rng.randint(0, total_positions - 1)
                if pos not in positions:
                    positions.append(pos)
                    # Convert to grid coordinates and set WILD
                    reel_idx = pos // ROWS
                    row_idx = pos % ROWS
                    grid[reel_idx][row_idx] = Symbol.WILD.value
                    break
                attempts += 1

        return positions

    def _count_specials(self, grid: list[list[int]]) -> tuple[int, int]:
        """Count scatters and wilds in grid."""
        scatters = 0
        wilds = 0
        for reel in grid:
            for symbol in reel:
                if symbol == Symbol.SCATTER.value:
                    scatters += 1
                elif symbol == Symbol.WILD.value:
                    wilds += 1
        return scatters, wilds

    def _calculate_win(
        self, grid: list[list[int]], base_bet: float
    ) -> tuple[float, list[dict[str, Any]]]:
        """
        Calculate win using paylines per GAME_RULES.md.

        Returns (total_win, list of winLine events).
        """
        win_lines: list[dict[str, Any]] = []
        total_win = 0.0

        # Check all paylines
        for line_id, payline in enumerate(PAYLINES):
            symbols_in_line = [grid[reel][payline[reel]] for reel in range(REELS)]
            win_amount, count = self._check_line(symbols_in_line, base_bet)
            if win_amount > 0:
                win_lines.append({
                    "type": "winLine",
                    "lineId": line_id,
                    "amount": win_amount,
                    "winX": win_amount / base_bet if base_bet > 0 else 0,
                })
                total_win += win_amount

        # Add scatter pays (scatters pay anywhere on grid)
        scatter_count = sum(
            1 for reel in grid for symbol in reel if symbol == Symbol.SCATTER.value
        )
        if scatter_count >= 3 and scatter_count in SCATTER_PAYS:
            scatter_win = base_bet * SCATTER_PAYS[scatter_count]
            win_lines.append({
                "type": "winLine",
                "lineId": -1,  # Special scatter line
                "amount": scatter_win,
                "winX": scatter_win / base_bet if base_bet > 0 else 0,
            })
            total_win += scatter_win

        return total_win, win_lines

    def _check_line(
        self, symbols: list[int], base_bet: float
    ) -> tuple[float, int]:
        """
        Check a single line for wins.

        Returns (win_amount, matching_count).
        """
        if not symbols:
            return 0.0, 0

        # Skip scatters in line evaluation
        first_symbol = None
        for s in symbols:
            if s != Symbol.SCATTER.value:
                first_symbol = s if s != Symbol.WILD.value else None
                break

        if first_symbol is None:
            # All wilds or scatters
            first_symbol = symbols[0] if symbols[0] != Symbol.SCATTER.value else -1

        # Count consecutive matching (including wilds)
        count = 0
        for s in symbols:
            if s == Symbol.SCATTER.value:
                break
            if s == first_symbol or s == Symbol.WILD.value or first_symbol == Symbol.WILD.value:
                count += 1
                if first_symbol == Symbol.WILD.value and s != Symbol.WILD.value:
                    first_symbol = s
            else:
                break

        # Payout table (simplified)
        if count < 3:
            return 0.0, count

        # Multipliers by symbol and count (calibrated for ~96.5% RTP with 10 paylines)
        # Includes Afterparty Rage x2 on ~3% of spins + Spotlight Wilds 5%
        # v2: reduced 8% from 104% to target 96.5%
        multipliers = {
            Symbol.HIGH1.value: {3: 1.70, 4: 8.56, 5: 85.6},
            Symbol.HIGH2.value: {3: 1.31, 4: 6.58, 5: 66.2},
            Symbol.HIGH3.value: {3: 1.03, 4: 5.15, 5: 51.5},
            Symbol.MID1.value: {3: 0.64, 4: 3.22, 5: 25.3},
            Symbol.MID2.value: {3: 0.52, 4: 2.53, 5: 17.0},
            Symbol.LOW1.value: {3: 0.33, 4: 1.21, 5: 6.6},
            Symbol.LOW2.value: {3: 0.23, 4: 0.95, 5: 4.7},
            Symbol.LOW3.value: {3: 0.14, 4: 0.66, 5: 3.27},
            Symbol.WILD.value: {3: 3.22, 4: 16.7, 5: 167.4},
        }

        symbol_mults = multipliers.get(first_symbol, {3: 0.5, 4: 2, 5: 5})
        mult = symbol_mults.get(count, 0)
        return base_bet * mult, count
