# Google Cloud Run deployment

The deployment workflow uses GitHub OIDC / Google Workload Identity Federation rather than a long-lived service-account JSON key.

Required GitHub repository variables:

- `GCP_PROJECT_ID`
- `GCP_REGION` (for example `europe-west1`)
- `GAR_REPOSITORY` (Artifact Registry Docker repository)
- `WIF_PROVIDER` (full provider resource name)
- `WIF_SERVICE_ACCOUNT` (deployment service account email)

Google Cloud APIs required: Cloud Run, Artifact Registry, IAM Credentials and Security Token Service. The deployment service account should receive only the roles needed to push the image and deploy the service, plus service-account user/impersonation where required.

The workflow builds an immutable image tag from the Git commit SHA, scans it, deploys it, and probes `/healthz`. Public unauthenticated access should be configured once as an explicit Cloud Run IAM decision rather than silently changed on every deploy.
