#!/usr/bin/env bash
#
# Bootstrap the GitHub Actions CI/CD identity for Echolingo.
#
# Creates ONE Entra app registration + service principal that GitHub Actions uses
# (via OIDC federated credentials) to deploy both environments, which live in the
# single Echolingo subscription:
#
#   push to dev   -> azd env "dev"   -> rg-echolingo-dev   (dev.echolingo.audio)
#   push to main  -> azd env "prod"  -> rg-echolingo-prod  (echolingo.audio)
#
# Why a script and not Bicep: the deploy identity can't live inside the azd
# deployment it runs (chicken-and-egg). This script is the reproducible,
# reviewable substitute for clicking in the portal. It is idempotent — re-running
# reuses the existing app, SP, role assignments and federated credentials.
#
# Prereqs: `az login` as a user with Owner (or Contributor + User Access
# Administrator) on the subscription.
#
# Usage:  ./infra/bootstrap-cicd.sh

set -euo pipefail

APP_NAME="sp-echolingo-cicd"
REPO="superroma/echolingo"

SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
TENANT_ID="$(az account show --query tenantId -o tsv)"

echo "Subscription : $SUBSCRIPTION_ID"
echo "Tenant       : $TENANT_ID"
echo "App          : $APP_NAME"
echo "Repo         : $REPO"
echo

# ---------------------------------------------------------------------------
# 1. App registration (reuse if it already exists).
# ---------------------------------------------------------------------------
APP_ID="$(az ad app list --display-name "$APP_NAME" --query '[0].appId' -o tsv)"
if [ -z "$APP_ID" ]; then
  APP_ID="$(az ad app create --display-name "$APP_NAME" --query appId -o tsv)"
  echo "Created app registration : $APP_ID"
else
  echo "Reusing app registration : $APP_ID"
fi

# ---------------------------------------------------------------------------
# 2. Service principal for the app (reuse if it already exists).
# ---------------------------------------------------------------------------
SP_OID="$(az ad sp list --filter "appId eq '$APP_ID'" --query '[0].id' -o tsv)"
if [ -z "$SP_OID" ]; then
  SP_OID="$(az ad sp create --id "$APP_ID" --query id -o tsv)"
  echo "Created service principal : $SP_OID"
else
  echo "Reusing service principal : $SP_OID"
fi

# ---------------------------------------------------------------------------
# 3. Subscription-scoped role assignments (az is a no-op if already present).
#    - Contributor                    : create/update all resources
#    - User Access Administrator      : role-assignments.bicep creates RBAC at deploy
#    - Storage Blob Data Contributor  : upload the Flex-Consumption deployment package
# ---------------------------------------------------------------------------
SCOPE="/subscriptions/$SUBSCRIPTION_ID"
for ROLE in "Contributor" "User Access Administrator" "Storage Blob Data Contributor"; do
  az role assignment create \
    --assignee-object-id "$SP_OID" \
    --assignee-principal-type ServicePrincipal \
    --role "$ROLE" \
    --scope "$SCOPE" \
    --only-show-errors >/dev/null
  echo "Assigned role            : $ROLE"
done

# ---------------------------------------------------------------------------
# 4. Federated credentials — one per deploy branch (reuse if present).
#    Subject ties a GitHub OIDC token from this repo+branch to this app.
# ---------------------------------------------------------------------------
EXISTING_FICS="$(az ad app federated-credential list --id "$APP_ID" --query '[].name' -o tsv)"
add_fic() {
  local name="$1" branch="$2"
  if echo "$EXISTING_FICS" | grep -qx "$name"; then
    echo "Reusing federated cred   : $name"
    return
  fi
  az ad app federated-credential create --id "$APP_ID" --parameters "{
    \"name\": \"$name\",
    \"issuer\": \"https://token.actions.githubusercontent.com\",
    \"subject\": \"repo:$REPO:ref:refs/heads/$branch\",
    \"audiences\": [\"api://AzureADTokenExchange\"]
  }" >/dev/null
  echo "Created federated cred   : $name (refs/heads/$branch)"
}
add_fic "github-dev" "dev"
add_fic "github-main" "main"

# ---------------------------------------------------------------------------
# 5. Print the repo secrets to set. (Federated login means no client secret.)
# ---------------------------------------------------------------------------
cat <<EOF

============================================================================
Done. The CI/CD principal is ready. Set these three GitHub repo secrets:

  gh secret set AZURE_CLIENT_ID       --repo $REPO --body "$APP_ID"
  gh secret set AZURE_TENANT_ID       --repo $REPO --body "$TENANT_ID"
  gh secret set AZURE_SUBSCRIPTION_ID --repo $REPO --body "$SUBSCRIPTION_ID"

(or Settings -> Secrets and variables -> Actions -> New repository secret)

Then push to 'dev' to deploy rg-echolingo-dev, or 'main' for rg-echolingo-prod.
============================================================================
EOF
