# api_gateway/load_balancer.py
import itertools
import threading
from typing import List


class RoundRobinBalancer:
    """
    Thread-safe round-robin load balancer.
    Cycles through service URLs on each call.
    """

    def __init__(self, urls: List[str]):
        self._urls    = urls
        self._cycle   = itertools.cycle(urls)
        self._lock    = threading.Lock()

    def next_url(self) -> str:
        """Return the next URL in the round-robin cycle."""
        with self._lock:
            return next(self._cycle)

    def all_urls(self) -> List[str]:
        return list(self._urls)


# ── Module-level balancer instances (one per service) ─────────────────────────
# Initialized lazily from settings when first used.

_balancers: dict[str, RoundRobinBalancer] = {}
_init_lock = threading.Lock()


def get_balancer(service_name: str, urls: List[str]) -> RoundRobinBalancer:
    """
    Get or create a balancer for a service.
    Call this once per service at startup.
    """
    with _init_lock:
        if service_name not in _balancers:
            _balancers[service_name] = RoundRobinBalancer(urls)
    return _balancers[service_name]
