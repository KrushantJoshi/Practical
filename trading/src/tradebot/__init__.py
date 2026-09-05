"""tradebot — autonomous trading system with a veto-only LLM council.

The safety invariant: deterministic code decides to trade; the research council
may only veto or shrink. `risk/` must never import from `research/`.
"""

__version__ = "0.1.0"
