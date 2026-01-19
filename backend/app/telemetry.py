"""Server-side telemetry per TELEMETRY.md."""
import logging
from dataclasses import dataclass
from typing import Any, Protocol


logger = logging.getLogger(__name__)


class TelemetrySink(Protocol):
    """Protocol for telemetry sinks."""

    def emit(self, event_name: str, data: dict[str, Any]) -> None:
        """Emit a telemetry event."""
        ...


class LoggingTelemetrySink:
    """Default sink that logs telemetry events."""

    def emit(self, event_name: str, data: dict[str, Any]) -> None:
        """Log telemetry event."""
        logger.info("TELEMETRY %s: %s", event_name, data)


@dataclass
class InitServedEvent:
    """init_served telemetry event per TELEMETRY.md."""

    player_id: str
    restore_state_present: bool
    restore_mode: str  # "FREE_SPINS" | "NONE"
    spins_remaining: int | None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for emission."""
        return {
            "player_id": self.player_id,
            "restore_state_present": self.restore_state_present,
            "restore_mode": self.restore_mode,
            "spins_remaining": self.spins_remaining,
        }


@dataclass
class SpinProcessedEvent:
    """spin_processed telemetry event per TELEMETRY.md."""

    player_id: str
    client_request_id: str
    lock_acquire_ms: float
    lock_wait_retries: int
    is_bonus_continuation: bool
    bonus_continuation_count: int
    # Correlation fields (Telemetry Delivery Gate v1)
    config_hash: str
    mode: str  # "base" | "buy" | "hype"
    round_id: str
    bonus_variant: str | None  # "standard" | "vip_buy" | null

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for emission."""
        return {
            "player_id": self.player_id,
            "client_request_id": self.client_request_id,
            "lock_acquire_ms": self.lock_acquire_ms,
            "lock_wait_retries": self.lock_wait_retries,
            "is_bonus_continuation": self.is_bonus_continuation,
            "bonus_continuation_count": self.bonus_continuation_count,
            "config_hash": self.config_hash,
            "mode": self.mode,
            "round_id": self.round_id,
            "bonus_variant": self.bonus_variant,
        }


@dataclass
class SpinRejectedEvent:
    """spin_rejected telemetry event per TELEMETRY.md."""

    player_id: str
    client_request_id: str | None
    reason: str  # "ROUND_IN_PROGRESS" | "INVALID_REQUEST" | "INVALID_BET" | ...
    lock_acquire_ms: float
    lock_wait_retries: int

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for emission."""
        return {
            "player_id": self.player_id,
            "client_request_id": self.client_request_id,
            "reason": self.reason,
            "lock_acquire_ms": self.lock_acquire_ms,
            "lock_wait_retries": self.lock_wait_retries,
        }


class TelemetryService:
    """Service for emitting server telemetry events."""

    def __init__(self, sink: TelemetrySink | None = None):
        self._sink = sink or LoggingTelemetrySink()
        self._sink_errors = 0  # Counter for sink failures

    def set_sink(self, sink: TelemetrySink) -> None:
        """Set the telemetry sink (useful for testing)."""
        self._sink = sink

    def _safe_emit(self, event_name: str, data: dict[str, Any]) -> None:
        """
        Emit event with exception safety per TELEMETRY.md Delivery Guarantee.

        Sink failures MUST NOT break HTTP requests.
        """
        try:
            self._sink.emit(event_name, data)
        except Exception as e:
            self._sink_errors += 1
            logger.warning(
                "Telemetry sink error (count=%d): %s - %s",
                self._sink_errors,
                event_name,
                str(e),
            )

    def emit_init_served(self, event: InitServedEvent) -> None:
        """Emit init_served event per TELEMETRY.md."""
        self._safe_emit("init_served", event.to_dict())

    def emit_spin_processed(self, event: SpinProcessedEvent) -> None:
        """Emit spin_processed event per TELEMETRY.md."""
        self._safe_emit("spin_processed", event.to_dict())

    def emit_spin_rejected(self, event: SpinRejectedEvent) -> None:
        """Emit spin_rejected event per TELEMETRY.md."""
        self._safe_emit("spin_rejected", event.to_dict())


# Global instance
telemetry_service = TelemetryService()
