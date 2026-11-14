"""Cloud Run Job entry point for the data pipeline.

Usage: job.py prices | job.py full

The pipeline scripts use relative paths, so each run copies them into a
scratch dir. matched_markets.csv persists between runs in GCS. The JSON output
is published to the repo's `data` branch, which always holds a single commit
(replaced each run, so history never grows), and a repository_dispatch event
tells the site's deploy workflow to rebuild with it.
"""
import base64, glob, json, os, shutil, subprocess, sys, urllib.error, urllib.request

from google.cloud import storage

APP_DIR = "/opt/app"
WORK = "/tmp/work"
REPO = os.environ["GITHUB_REPO"]      # owner/name
DATA_BRANCH = os.environ.get("GITHUB_DATA_BRANCH", "data")
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
        files += ["web/public/data/all_events.json", "web/public/sitemap.xml"]

    if publish_files(files, f"market data ({mode} run)"):
        gh("POST", "/dispatches", {"event_type": "data-updated"})
        print("triggered site deploy")


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
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else {}


def publish_files(paths, message):
    """Replace the data branch with one parentless commit holding the new files.

    Files not in `paths` (e.g. all_events.json on hourly runs) are carried over from
    the current branch tree. Returns False when nothing changed.
    """
    try:
        head = gh("GET", f"/git/ref/heads/{DATA_BRANCH}")["object"]["sha"]
        base_tree = gh("GET", f"/git/commits/{head}")["tree"]["sha"]
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
        head = base_tree = None
    tree = []
    for p in paths:
        with open(p, "rb") as f:
            blob = gh("POST", "/git/blobs", {"content": base64.b64encode(f.read()).decode(), "encoding": "base64"})
        tree.append({"path": p, "mode": "100644", "type": "blob", "sha": blob["sha"]})
    new_tree = gh("POST", "/git/trees", {**({"base_tree": base_tree} if base_tree else {}), "tree": tree})["sha"]
    if new_tree == base_tree:
        print("no data changes — nothing to publish")
        return False
    commit = gh("POST", "/git/commits", {"message": message, "tree": new_tree, "parents": []})["sha"]
    if head:
        gh("PATCH", f"/git/refs/heads/{DATA_BRANCH}", {"sha": commit, "force": True})
    else:
        gh("POST", "/git/refs", {"ref": f"refs/heads/{DATA_BRANCH}", "sha": commit})
    print(f"published {commit} to {DATA_BRANCH}")
    return True


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "prices")
