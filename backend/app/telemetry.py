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

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for emission."""
        return {
            "player_id": self.player_id,
            "client_request_id": self.client_request_id,
            "lock_acquire_ms": self.lock_acquire_ms,
            "lock_wait_retries": self.lock_wait_retries,
            "is_bonus_continuation": self.is_bonus_continuation,
            "bonus_continuation_count": self.bonus_continuation_count,
        }


class TelemetryService:
    """Service for emitting server telemetry events."""

    def __init__(self, sink: TelemetrySink | None = None):
        self._sink = sink or LoggingTelemetrySink()

    def set_sink(self, sink: TelemetrySink) -> None:
        """Set the telemetry sink (useful for testing)."""
        self._sink = sink

    def emit_init_served(self, event: InitServedEvent) -> None:
        """Emit init_served event per TELEMETRY.md."""
        self._sink.emit("init_served", event.to_dict())

    def emit_spin_processed(self, event: SpinProcessedEvent) -> None:
        """Emit spin_processed event per TELEMETRY.md."""
        self._sink.emit("spin_processed", event.to_dict())


# Global instance
telemetry_service = TelemetryService()
