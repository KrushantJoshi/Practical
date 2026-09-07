"""Market data ingestion.

Everything stored here is stamped with the time we learned it, and nothing is
ever rewritten. That is what makes a backtest honest: a strategy asked about
time T can only ever see facts we actually had at time T.
"""
