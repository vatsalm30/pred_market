import asyncio
import json
import threading
import time
from collections import deque
from datetime import datetime

import websockets
import matplotlib.pyplot as plt
import matplotlib.animation as animation
from matplotlib.patches import Rectangle

# ---------- config ----------
API_KEY        = "pn_live_32404a197df63e60f73a22c8dce6d6749ca37e090e6a3fbb"
SYMBOL         = "BNB/USD"   # which feed to chart: BTC/USD, ETH/USD, SOL/USD, ...
BUCKET_SECONDS = 5           # candle interval
MAX_CANDLES    = 60          # rolling window size
REDRAW_MS      = 500         # chart refresh rate

# ---------- shared state ----------
lock = threading.Lock()
candles = {}                                   # bucket_start_ts -> {"o","h","l","c"}
order = deque(maxlen=MAX_CANDLES)              # bucket_start_ts in insertion order
last_price = {"value": None, "ts": None}       # for live readout

def add_tick(price: float, ts: int) -> None:
    bucket = (ts // BUCKET_SECONDS) * BUCKET_SECONDS
    with lock:
        if bucket not in candles:
            candles[bucket] = {"o": price, "h": price, "l": price, "c": price}
            order.append(bucket)
            # deque auto-trims; drop any candles not in the window
            alive = set(order)
            for k in list(candles):
                if k not in alive:
                    del candles[k]
        c = candles[bucket]
        if price > c["h"]: c["h"] = price
        if price < c["l"]: c["l"] = price
        c["c"] = price
        last_price["value"] = price
        last_price["ts"] = ts

# ---------- websocket ----------
async def stream() -> None:
    url = f"wss://ws.polynode.dev/ws?key={API_KEY}"
    async with websockets.connect(url) as ws:
        await ws.send(json.dumps({"action": "subscribe", "type": "chainlink"}))
        print(f"[ws] subscribed, charting {SYMBOL} in {BUCKET_SECONDS}s candles")
        async for message in ws:
            try:
                msg = json.loads(message)
            except json.JSONDecodeError:
                continue
            if msg.get("type") != "price_feed":
                continue
            d = msg.get("data", {})
            if d.get("feed") != SYMBOL:
                continue
            add_tick(float(d["price"]), int(d["timestamp"]))

def run_ws_forever() -> None:
    # auto-reconnect loop in case the socket drops
    while True:
        try:
            asyncio.run(stream())
        except Exception as e:
            print(f"[ws] disconnected: {e!r} — reconnecting in 2s")
            time.sleep(2)

threading.Thread(target=run_ws_forever, daemon=True).start()

# ---------- chart ----------
plt.style.use("dark_background")
fig, ax = plt.subplots(figsize=(13, 6.5))
fig.canvas.manager.set_window_title(f"{SYMBOL} live OHLC")
fig.patch.set_facecolor("#0e1117")

GREEN = "#26a69a"
RED   = "#ef5350"

def update(_):
    with lock:
        keys = list(order)
        snap = [(k, dict(candles[k])) for k in keys if k in candles]
        live_price = last_price["value"]
        live_ts = last_price["ts"]

    ax.clear()
    ax.set_facecolor("#0e1117")

    if not snap:
        ax.text(0.5, 0.5, f"waiting for {SYMBOL} ticks…",
                ha="center", va="center", color="#888",
                transform=ax.transAxes, fontsize=14)
        _style_axes(ax)
        return

    width = BUCKET_SECONDS * 0.7
    for bucket, c in snap:
        color = GREEN if c["c"] >= c["o"] else RED
        # wick
        ax.plot([bucket, bucket], [c["l"], c["h"]],
                color=color, linewidth=1, solid_capstyle="butt")
        # body — guarantee a visible sliver even on a doji
        body_low  = min(c["o"], c["c"])
        body_high = max(c["o"], c["c"])
        height = body_high - body_low
        if height == 0:
            span = c["h"] - c["l"] or max(abs(c["c"]) * 1e-5, 1e-9)
            height = span * 0.05
            body_low -= height / 2
        ax.add_patch(Rectangle((bucket - width / 2, body_low),
                               width, height,
                               facecolor=color, edgecolor=color, linewidth=0.5))

    times = [b for b, _ in snap]
    ax.set_xlim(min(times) - BUCKET_SECONDS, max(times) + BUCKET_SECONDS * 2)

    # x labels as HH:MM:SS
    step = max(1, len(times) // 8)
    xticks = times[::step]
    ax.set_xticks(xticks)
    ax.set_xticklabels(
        [datetime.fromtimestamp(t).strftime("%H:%M:%S") for t in xticks],
        rotation=30, ha="right"
    )

    # last-price horizontal guide
    if live_price is not None:
        ax.axhline(live_price, color="#888", linewidth=0.6,
                   linestyle="--", alpha=0.6)
        ax.text(max(times) + BUCKET_SECONDS * 2, live_price,
                f"  {live_price:,.4f}",
                va="center", ha="left", color="#ddd", fontsize=10,
                bbox=dict(facecolor="#1e222d", edgecolor="#444",
                          boxstyle="round,pad=0.3"))

    title = f"{SYMBOL}   •   {BUCKET_SECONDS}s candles   •   live"
    if live_price is not None:
        title += f"   •   {live_price:,.4f}"
    ax.set_title(title, color="white", fontsize=13, loc="left", pad=12)
    _style_axes(ax)

def _style_axes(ax):
    ax.tick_params(colors="#aaa")
    for spine in ax.spines.values():
        spine.set_color("#333")
    ax.grid(True, color="#1c1f26", linestyle="-", linewidth=0.6)
    ax.set_ylabel("price (USD)", color="#aaa")

ani = animation.FuncAnimation(
    fig, update, interval=REDRAW_MS, cache_frame_data=False
)

plt.tight_layout()
plt.show()