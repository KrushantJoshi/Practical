"""Configuration loading and validation.

Config is TOML (stdlib `tomllib`, no third-party dependency). Every risk limit
has a conservative default, so a config that omits a field is safe rather than
unbounded. Secrets are never read from the config file — only from the
environment — so the config can be committed and diffed.
"""

from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass, field, fields, is_dataclass
from pathlib import Path
from typing import Any, Mapping, Optional, Type, TypeVar

T = TypeVar("T")


class ConfigError(ValueError):
    pass


@dataclass(frozen=True)
class RiskConfig:
    """Hard limits. These are enforced in deterministic code and are the last
    word: no strategy, and no language model, can raise any of them at runtime."""

    # Fraction of equity at risk on a single trade if its stop is hit.
    risk_per_trade: float = 0.005          # 0.5%
    # Max notional in one position as a fraction of equity.
    max_position_pct: float = 0.10
    # Max total gross exposure as a fraction of equity (1.0 = no leverage).
    max_gross_exposure: float = 1.0
    # Max simultaneous open positions.
    max_open_positions: int = 8
    # Max positions sharing a correlation bucket (sector / chain / theme).
    max_per_bucket: int = 3
    # Halt trading for the day once equity is down this fraction from the
    # session's opening equity.
    daily_loss_halt_pct: float = 0.03
    # Halt entirely (requires manual reset) at this drawdown from peak equity.
    max_drawdown_halt_pct: float = 0.12
    # Reject any entry whose round-trip cost estimate exceeds this share of the
    # expected move. Cost-blind trading is the most common way small accounts die.
    max_cost_to_edge_ratio: float = 0.33
    # Reject instruments wider than this half-spread.
    max_spread_bps: float = 60.0
    # Per-asset-class notional caps as a fraction of equity.
    class_caps: Mapping[str, float] = field(default_factory=lambda: {
        "equity": 1.0,
        "crypto": 0.50,
        "memecoin": 0.02,   # deliberately tiny: this is the lottery-ticket sleeve
    })
    # Minimum stop distance in bps; protects against stops inside the noise band.
    min_stop_bps: float = 50.0
    # Max trades per rolling hour; a runaway loop is a risk event, not a feature.
    max_trades_per_hour: int = 12
    max_trades_per_day: int = 60


@dataclass(frozen=True)
class MemecoinScreenConfig:
    """Hard filters for pump.fun-style tokens. Every one of these is a
    deterministic gate — a token failing any single check is never traded,
    regardless of how good the narrative looks."""

    min_liquidity_usd: float = 25_000.0
    min_age_seconds: float = 900.0          # 15m: skip the snipe-bot window
    max_age_seconds: float = 172_800.0      # 48h: skip stale husks
    min_unique_holders: int = 150
    # Reject if the top N wallets (excluding LP + burn) hold more than this.
    top_holder_concentration_max: float = 0.25
    top_holder_count: int = 10
    # Creator must not hold more than this fraction.
    max_creator_hold_pct: float = 0.05
    # Mint and freeze authority must be revoked, LP must be burned or locked.
    require_mint_authority_revoked: bool = True
    require_freeze_authority_revoked: bool = True
    require_lp_burned_or_locked: bool = True
    # Reject a token whose price already went vertical — that is the pump you
    # are being sold into, not the one you are catching.
    max_gain_since_launch_pct: float = 400.0
    max_gain_last_5m_pct: float = 40.0
    # Volume that is mostly the same handful of wallets is wash trading.
    min_unique_traders_5m: int = 25
    max_single_wallet_volume_share: float = 0.20
    # Buy/sell tax traps.
    max_buy_tax_pct: float = 2.0
    max_sell_tax_pct: float = 2.0
    # Estimated slippage for the intended clip must stay under this.
    max_slippage_bps: float = 300.0


@dataclass(frozen=True)
class ResearchConfig:
    provider: str = "none"          # none | anthropic | xai
    model: str = "claude-opus-5"
    # The model is advisory-only by construction; see ResearchVerdict.
    enabled: bool = True
    # If the model call fails or returns malformed output, do we proceed?
    # Default False: no research, no trade.
    fail_open: bool = False
    timeout_seconds: float = 30.0
    max_calls_per_hour: int = 120
    cache_ttl_seconds: float = 900.0


@dataclass(frozen=True)
class ExecutionConfig:
    mode: str = "paper"             # paper | live
    equity_venue: str = "paper"     # paper | alpaca
    crypto_venue: str = "paper"     # paper | ccxt
    memecoin_venue: str = "paper"   # paper | solana
    # Live trading additionally requires TRADEBOT_ALLOW_LIVE=yes in the env.
    # Two independent switches, because one is too easy to flip by accident.
    slippage_bps_assumed: float = 15.0
    fee_bps_assumed: float = 10.0
    order_type: str = "limit"       # market orders on illiquid names are a gift
    limit_offset_bps: float = 10.0


@dataclass(frozen=True)
class ScheduleConfig:
    # Seconds between pipeline passes, per class.
    equity_poll_seconds: float = 60.0
    crypto_poll_seconds: float = 30.0
    memecoin_poll_seconds: float = 20.0
    research_poll_seconds: float = 300.0
    # Trade equities only in regular hours by default; extended-hours liquidity
    # is thin and the spread routinely exceeds the edge.
    equity_extended_hours: bool = False
    # Reconciliation against the venue's own state.
    reconcile_seconds: float = 120.0


@dataclass(frozen=True)
class Config:
    account_equity_start: float = 10_000.0
    base_currency: str = "USD"
    # Relative paths resolve against the config file's project root, not the
    # current working directory — otherwise running from a different directory
    # silently creates a second, empty state database.
    state_dir: str = "state"
    config_path: str = ""
    risk: RiskConfig = field(default_factory=RiskConfig)
    memecoin: MemecoinScreenConfig = field(default_factory=MemecoinScreenConfig)
    research: ResearchConfig = field(default_factory=ResearchConfig)
    execution: ExecutionConfig = field(default_factory=ExecutionConfig)
    schedule: ScheduleConfig = field(default_factory=ScheduleConfig)
    equity_universe: tuple[str, ...] = ()
    crypto_universe: tuple[str, ...] = ()

    @property
    def resolved_state_dir(self) -> Path:
        """Absolute state directory, stable regardless of the working directory."""
        p = Path(self.state_dir)
        if p.is_absolute() or not self.config_path:
            return p
        # config lives at <root>/config/config.toml, so the root is two up.
        return (Path(self.config_path).resolve().parent.parent / p).resolve()

    @property
    def live(self) -> bool:
        """Live trading requires BOTH the config flag and the env guard."""
        return (self.execution.mode == "live"
                and os.environ.get("TRADEBOT_ALLOW_LIVE", "").lower() == "yes")


def _build(cls: Type[T], data: Mapping[str, Any], path: str = "") -> T:
    """Construct a dataclass from a mapping, rejecting unknown keys.

    Unknown keys are an error rather than a shrug: a typo'd risk limit that
    silently falls back to the default is exactly the bug that shows up as a
    surprise loss three weeks later.
    """
    if not is_dataclass(cls):
        raise ConfigError(f"{cls} is not a config dataclass")
    known = {f.name: f for f in fields(cls)}
    unknown = set(data) - set(known)
    if unknown:
        where = path or cls.__name__
        raise ConfigError(f"unknown config key(s) in [{where}]: {sorted(unknown)}")

    kwargs: dict[str, Any] = {}
    for name, f in known.items():
        if name not in data:
            continue
        value = data[name]
        # Nested sections are constructed explicitly in load(); here we only
        # normalise scalars and sequences.
        if isinstance(value, list):
            kwargs[name] = tuple(value)
        else:
            kwargs[name] = value
    return cls(**kwargs)


_SECTIONS: dict[str, type] = {
    "risk": RiskConfig,
    "memecoin": MemecoinScreenConfig,
    "research": ResearchConfig,
    "execution": ExecutionConfig,
    "schedule": ScheduleConfig,
}


def load(path: str | Path) -> Config:
    p = Path(path)
    if not p.exists():
        raise ConfigError(f"config file not found: {p}")
    with p.open("rb") as fh:
        raw = tomllib.load(fh)

    sections = {k: _build(cls, raw.pop(k, {}) or {}, k) for k, cls in _SECTIONS.items()}
    top = _build(Config, raw, "")
    cfg = Config(
        account_equity_start=top.account_equity_start,
        base_currency=top.base_currency,
        state_dir=top.state_dir,
        equity_universe=top.equity_universe,
        crypto_universe=top.crypto_universe,
        config_path=str(p.resolve()),
        **sections,
    )
    validate(cfg)
    return cfg


def validate(cfg: Config) -> None:
    r = cfg.risk
    checks: list[tuple[bool, str]] = [
        (0 < r.risk_per_trade <= 0.05, "risk.risk_per_trade must be in (0, 0.05]"),
        (0 < r.max_position_pct <= 1.0, "risk.max_position_pct must be in (0, 1]"),
        (0 < r.max_gross_exposure <= 3.0, "risk.max_gross_exposure must be in (0, 3]"),
        (r.max_open_positions >= 1, "risk.max_open_positions must be >= 1"),
        (0 < r.daily_loss_halt_pct < 1, "risk.daily_loss_halt_pct must be in (0, 1)"),
        (0 < r.max_drawdown_halt_pct < 1, "risk.max_drawdown_halt_pct must be in (0, 1)"),
        (r.risk_per_trade <= r.max_position_pct,
         "risk.risk_per_trade cannot exceed risk.max_position_pct"),
        (r.daily_loss_halt_pct <= r.max_drawdown_halt_pct,
         "risk.daily_loss_halt_pct should not exceed risk.max_drawdown_halt_pct"),
        (r.min_stop_bps > 0, "risk.min_stop_bps must be positive"),
        (cfg.execution.mode in ("paper", "live"), "execution.mode must be paper|live"),
        (cfg.research.provider in ("none", "anthropic", "xai"),
         "research.provider must be none|anthropic|xai"),
        (cfg.account_equity_start > 0, "account_equity_start must be positive"),
    ]
    problems = [msg for ok, msg in checks if not ok]
    for name, cap in cfg.risk.class_caps.items():
        if not 0 <= cap <= 1.0:
            problems.append(f"risk.class_caps.{name} must be in [0, 1]")
    if problems:
        raise ConfigError("invalid config:\n  - " + "\n  - ".join(problems))


def secret(name: str) -> Optional[str]:
    """Secrets come from the environment only, never from disk config."""
    value = os.environ.get(name)
    return value if value else None
