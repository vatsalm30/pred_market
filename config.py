import os
from dotenv import load_dotenv

load_dotenv()

# Kalshi
KALSHI_EMAIL = os.getenv("KALSHI_EMAIL", "")
KALSHI_PASSWORD = os.getenv("KALSHI_PASSWORD", "")
KALSHI_API_KEY = os.getenv("KALSHI_API_KEY", "")
KALSHI_BASE_URL = "https://api.elections.kalshi.com/trade-api/v2"

# Polymarket
POLYMARKET_GAMMA_URL = "https://gamma-api.polymarket.com"
POLYMARKET_CLOB_URL = "https://clob.polymarket.com"

# Platform fees applied to winning leg
KALSHI_WIN_FEE = 0.0     # Kalshi charges no exchange fee on binary markets
POLYMARKET_WIN_FEE = 0.02  # Polymarket charges ~2% on winnings

# Scanner behaviour
MIN_PROFIT_PCT = float(os.getenv("MIN_PROFIT_PCT", "1.0"))
SCAN_INTERVAL_SEC = int(os.getenv("SCAN_INTERVAL_SEC", "30"))
MATCH_THRESHOLD = float(os.getenv("MATCH_THRESHOLD", "0.72"))
MAX_POLY_MARKETS = int(os.getenv("MAX_POLY_MARKETS", "500"))
MAX_KALSHI_MARKETS = int(os.getenv("MAX_KALSHI_MARKETS", "600"))
KALSHI_PAGE_DELAY = float(os.getenv("KALSHI_PAGE_DELAY", "0.3"))  # seconds between pages

CSV_LOG_FILE = "arbitrage_log.csv"
