#!/usr/bin/env bash
# Deploy the data pipeline as two Cloud Run Jobs (prices hourly, full twice a
# day) triggered by Cloud Scheduler. Re-runnable: every step is create-or-update.
#
# Secrets are read from env on the first run (or to rotate them):
#   GITHUB_TOKEN           fine-grained PAT, Contents read/write on the repo
#   KALSHI_API_KEY
#   AWS_ACCESS_KEY_ID      keys for the omnipred-gcp-pipeline IAM user (aws/)
#   AWS_SECRET_ACCESS_KEY
# Optional env: GCP_REGION (default us-central1), SITE_URL
set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT=$(gcloud config get-value project 2>/dev/null)
REGION="${GCP_REGION:-us-central1}"
IMAGE="$REGION-docker.pkg.dev/$PROJECT/omnipred/pipeline:latest"
BUCKET="$PROJECT-omnipred-state"
JOB_SA="omnipred-pipeline@$PROJECT.iam.gserviceaccount.com"
SCHED_SA="omnipred-scheduler@$PROJECT.iam.gserviceaccount.com"

gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  cloudscheduler.googleapis.com secretmanager.googleapis.com storage.googleapis.com

# ── Image ──────────────────────────────────────────────────────────────────
if ! gcloud artifacts repositories describe omnipred --location "$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create omnipred --location "$REGION" --repository-format docker
  # Keep only the newest image so storage stays near the free 0.5 GB
  policy=$(mktemp)
  echo '[{"name":"keep-latest","action":{"type":"Keep"},"mostRecentVersions":{"keepCount":1}},
         {"name":"delete-rest","action":{"type":"Delete"},"condition":{"tagState":"ANY"}}]' > "$policy"
  gcloud artifacts repositories set-cleanup-policies omnipred --location "$REGION" --policy "$policy" --no-dry-run
  rm "$policy"
fi
gcloud builds submit --config gcp/cloudbuild.yaml --substitutions "_IMAGE=$IMAGE" .

# ── State bucket + secrets ────────────────────────────────────────────────
gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1 ||
  gcloud storage buckets create "gs://$BUCKET" --location "$REGION" --uniform-bucket-level-access

for sa in omnipred-pipeline omnipred-scheduler; do
  gcloud iam service-accounts describe "$sa@$PROJECT.iam.gserviceaccount.com" >/dev/null 2>&1 ||
    gcloud iam service-accounts create "$sa"
done
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member "serviceAccount:$JOB_SA" --role roles/storage.objectAdmin >/dev/null

for pair in github-token:GITHUB_TOKEN kalshi-api-key:KALSHI_API_KEY \
            aws-access-key-id:AWS_ACCESS_KEY_ID aws-secret-access-key:AWS_SECRET_ACCESS_KEY; do
  name=${pair%%:*}; var=${pair#*:}
  if ! gcloud secrets describe "$name" >/dev/null 2>&1; then
    : "${!var:?set $var for the first deploy}"
    gcloud secrets create "$name" --replication-policy automatic
  fi
  # Only add a new version when a value is supplied (first run or rotation)
  if [ -n "${!var:-}" ]; then
    printf %s "${!var}" | gcloud secrets versions add "$name" --data-file=-
  fi
  gcloud secrets add-iam-policy-binding "$name" \
    --member "serviceAccount:$JOB_SA" --role roles/secretmanager.secretAccessor >/dev/null
done

# ── Jobs + schedules ──────────────────────────────────────────────────────
for spec in "prices|30 * * * *" "full|0 2,14 * * *"; do
  mode=${spec%%|*}; cron=${spec#*|}
  job="omnipred-pipeline-$mode"

  gcloud run jobs deploy "$job" \
    --region "$REGION" \
    --image "$IMAGE" \
    --args "$mode" \
    --cpu 2 --memory 4Gi \
    --task-timeout 3600 --max-retries 0 \
    --service-account "$JOB_SA" \
    --set-env-vars "STATE_BUCKET=$BUCKET,GITHUB_REPO=vatsalm30/pred_market,DYNAMODB_TABLE=omnipred,AWS_DEFAULT_REGION=us-east-1,SITE_URL=${SITE_URL:-https://www.omnipred.com}" \
    --set-secrets "GITHUB_TOKEN=github-token:latest,KALSHI_API_KEY=kalshi-api-key:latest,AWS_ACCESS_KEY_ID=aws-access-key-id:latest,AWS_SECRET_ACCESS_KEY=aws-secret-access-key:latest"

  gcloud run jobs add-iam-policy-binding "$job" --region "$REGION" \
    --member "serviceAccount:$SCHED_SA" --role roles/run.invoker >/dev/null

  verb=create
  gcloud scheduler jobs describe "$job" --location "$REGION" >/dev/null 2>&1 && verb=update
  gcloud scheduler jobs "$verb" http "$job" \
    --location "$REGION" \
    --schedule "$cron" --time-zone UTC \
    --uri "https://run.googleapis.com/v2/projects/$PROJECT/locations/$REGION/jobs/$job:run" \
    --http-method POST \
    --oauth-service-account-email "$SCHED_SA"
done

echo "Deployed. Run one now with: gcloud run jobs execute omnipred-pipeline-prices --region $REGION --wait"
