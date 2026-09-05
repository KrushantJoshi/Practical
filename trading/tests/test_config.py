"""Config loading tests.

Two behaviours here are deliberate and worth pinning down: unknown keys are an
error (a typo'd risk limit that silently falls back to a default is exactly the
bug that shows up as a surprise loss weeks later), and relative paths resolve
against the config file rather than the working directory.
"""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from tradebot import config as cfgmod

EXAMPLE = Path(__file__).resolve().parents[1] / "config" / "config.example.toml"


class TestExampleConfig(unittest.TestCase):
    def test_shipped_example_is_valid(self):
        c = cfgmod.load(EXAMPLE)
        self.assertEqual(c.account_equity_start, 500.0)
        self.assertEqual(c.execution.mode, "paper")

    def test_example_ships_paper_and_not_live(self):
        self.assertFalse(cfgmod.load(EXAMPLE).live)

    def test_memecoin_allocation_defaults_to_zero(self):
        # The research says expectancy is negative and $10 cannot express the
        # trade. If someone raises this, it should be a deliberate edit.
        self.assertEqual(cfgmod.load(EXAMPLE).risk.class_caps["memecoin"], 0.0)

    def test_research_fails_closed(self):
        self.assertFalse(cfgmod.load(EXAMPLE).research.fail_open)


class TestLiveGuard(unittest.TestCase):
    def _write(self, body: str) -> Path:
        d = Path(tempfile.mkdtemp()) / "config"
        d.mkdir(parents=True)
        p = d / "config.toml"
        p.write_text(body)
        return p

    def test_live_requires_both_switches(self):
        p = self._write('account_equity_start = 500.0\n'
                        '[execution]\nmode = "live"\n')
        prior = os.environ.pop("TRADEBOT_ALLOW_LIVE", None)
        try:
            self.assertFalse(cfgmod.load(p).live, "config alone must not arm live")
            os.environ["TRADEBOT_ALLOW_LIVE"] = "yes"
            self.assertTrue(cfgmod.load(p).live)
            os.environ["TRADEBOT_ALLOW_LIVE"] = "true"
            self.assertFalse(cfgmod.load(p).live, "only 'yes' arms live")
        finally:
            os.environ.pop("TRADEBOT_ALLOW_LIVE", None)
            if prior is not None:
                os.environ["TRADEBOT_ALLOW_LIVE"] = prior

    def test_paper_mode_ignores_the_env_switch(self):
        p = self._write('account_equity_start = 500.0\n')
        os.environ["TRADEBOT_ALLOW_LIVE"] = "yes"
        try:
            self.assertFalse(cfgmod.load(p).live)
        finally:
            os.environ.pop("TRADEBOT_ALLOW_LIVE", None)


class TestValidation(unittest.TestCase):
    def _write(self, body: str) -> Path:
        d = Path(tempfile.mkdtemp()) / "config"
        d.mkdir(parents=True)
        p = d / "config.toml"
        p.write_text(body)
        return p

    def test_unknown_key_is_an_error_not_a_silent_default(self):
        p = self._write('[risk]\nrisk_pre_trade = 0.5\n')
        with self.assertRaises(cfgmod.ConfigError) as cm:
            cfgmod.load(p)
        self.assertIn("unknown config key", str(cm.exception))

    def test_absurd_risk_per_trade_rejected(self):
        p = self._write('[risk]\nrisk_per_trade = 0.5\n')
        with self.assertRaises(cfgmod.ConfigError):
            cfgmod.load(p)

    def test_daily_halt_above_max_drawdown_rejected(self):
        p = self._write('[risk]\ndaily_loss_halt_pct = 0.5\n'
                        'max_drawdown_halt_pct = 0.1\n')
        with self.assertRaises(cfgmod.ConfigError):
            cfgmod.load(p)

    def test_missing_file_is_an_error(self):
        with self.assertRaises(cfgmod.ConfigError):
            cfgmod.load("/nonexistent/config.toml")


class TestStateDirResolution(unittest.TestCase):
    def test_relative_state_dir_resolves_against_the_config_not_the_cwd(self):
        root = Path(tempfile.mkdtemp())
        (root / "config").mkdir()
        p = root / "config" / "config.toml"
        p.write_text('state_dir = "state"\n')

        cfg = cfgmod.load(p)
        expected = (root / "state").resolve()
        self.assertEqual(cfg.resolved_state_dir, expected)

        # Changing directory must not move the database.
        prior = os.getcwd()
        try:
            os.chdir(tempfile.mkdtemp())
            self.assertEqual(cfgmod.load(p).resolved_state_dir, expected)
        finally:
            os.chdir(prior)

    def test_absolute_state_dir_is_left_alone(self):
        root = Path(tempfile.mkdtemp())
        (root / "config").mkdir()
        p = root / "config" / "config.toml"
        p.write_text(f'state_dir = "/var/lib/tradebot"\n')
        self.assertEqual(cfgmod.load(p).resolved_state_dir,
                         Path("/var/lib/tradebot"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
