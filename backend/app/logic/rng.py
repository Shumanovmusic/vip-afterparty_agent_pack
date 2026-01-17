"""RNG module per RNG_POLICY.md."""
import secrets
from abc import ABC, abstractmethod


class RNGBase(ABC):
    """Abstract RNG interface per RNG_POLICY.md."""

    @abstractmethod
    def random(self) -> float:
        """Return random float in [0, 1)."""
        pass

    @abstractmethod
    def randint(self, a: int, b: int) -> int:
        """Return random int in [a, b] inclusive."""
        pass


class ProductionRNG(RNGBase):
    """
    Production RNG per RNG_POLICY.md.

    Uses cryptographically secure source, no fixed seed.
    """

    def random(self) -> float:
        return secrets.randbelow(2**32) / (2**32)

    def randint(self, a: int, b: int) -> int:
        return secrets.randbelow(b - a + 1) + a


class SeededRNG(RNGBase):
    """
    Test/Simulation RNG per RNG_POLICY.md.

    Deterministic, fully controlled by seed.
    Must log seed and config_hash for reproducibility.
    """

    def __init__(self, seed: int):
        import random

        self._rng = random.Random(seed)
        self.seed = seed

    def random(self) -> float:
        return self._rng.random()

    def randint(self, a: int, b: int) -> int:
        return self._rng.randint(a, b)
