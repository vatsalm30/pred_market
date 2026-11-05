"""Cloud Run Job entry point for the data pipeline.

Usage: job.py prices | job.py full

The pipeline scripts use relative paths, so each run copies them into a
scratch dir. matched_markets.csv persists between runs in GCS, and the JSON
output is committed to GitHub so Vercel redeploys with fresh data, same as
the old GitHub Actions workflow.
"""
import base64, glob, json, os, shutil, subprocess, sys, urllib.request

from google.cloud import storage

APP_DIR = "/opt/app"
WORK = "/tmp/work"
REPO = os.environ["GITHUB_REPO"]      # owner/name
BRANCH = os.environ.get("GITHUB_BRANCH", "main")
STATE_FILES = ["matched_markets.csv"]


def main(mode):
    bucket = storage.Client().bucket(os.environ["STATE_BUCKET"])
    shutil.rmtree(WORK, ignore_errors=True)
    os.makedirs(os.path.join(WORK, "web", "public", "data"))
    for f in glob.glob(os.path.join(APP_DIR, "*.py")):
        shutil.copy(f, WORK)
    os.chdir(WORK)

    for name in STATE_FILES:
        blob = bucket.blob(name)
        if blob.exists():
            blob.download_to_filename(name)
        else:
            print(f"no saved {name} — pipeline will rebuild it")

    args = [sys.executable, "run_pipeline.py"] + (["--full"] if mode == "full" else [])
    subprocess.run(args, check=True)

    for name in STATE_FILES:
        if os.path.exists(name):
            bucket.blob(name).upload_from_filename(name)

    files = [
        "web/public/data/matched_markets.json",
        "web/public/data/arbitrage_opportunities.json",
    ]
    if mode == "full":
        # all_events.json only exists after a full run
        subprocess.run([sys.executable, "generate_sitemap.py"], check=True)
        files.append("web/public/sitemap.xml")

    commit_files(files, "chore: refresh market data [skip ci]")


def gh(method, path, body=None):
    req = urllib.request.Request(
        f"https://api.github.com/repos/{REPO}{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}",
            "Accept": "application/vnd.github+json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def commit_files(paths, message):
    """Commit several files in one commit via the Git Data API."""
    head = gh("GET", f"/git/ref/heads/{BRANCH}")["object"]["sha"]
    base_tree = gh("GET", f"/git/commits/{head}")["tree"]["sha"]
    tree = []
    for p in paths:
        with open(p, "rb") as f:
            blob = gh("POST", "/git/blobs", {"content": base64.b64encode(f.read()).decode(), "encoding": "base64"})
        tree.append({"path": p, "mode": "100644", "type": "blob", "sha": blob["sha"]})
    new_tree = gh("POST", "/git/trees", {"base_tree": base_tree, "tree": tree})["sha"]
    if new_tree == base_tree:
        print("no data changes — skipping commit")
        return
    commit = gh("POST", "/git/commits", {"message": message, "tree": new_tree, "parents": [head]})["sha"]
    gh("PATCH", f"/git/refs/heads/{BRANCH}", {"sha": commit})
    print(f"committed {commit}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "prices")
