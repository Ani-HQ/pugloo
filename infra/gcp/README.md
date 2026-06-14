# Pugloo GCP Infrastructure

## Prerequisites

- [Terraform](https://terraform.io) >= 1.0
- [gcloud](https://cloud.google.com/sdk) CLI
- GCP project with billing enabled

## Setup

1. Copy `terraform.tfvars.example` to `terraform.tfvars` and set your project ID.

2. Enable required APIs:

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  --project=YOUR_PROJECT_ID
```

3. Build and push images:

```bash
# Build tunnel-gateway
cd services/tunnel-gateway
gcloud builds submit --tag us-central1-docker.pkg.dev/YOUR_PROJECT_ID/pugloo/tunnel-gateway:latest

# Build control-plane
cd ../control-plane
gcloud builds submit --tag us-central1-docker.pkg.dev/YOUR_PROJECT_ID/pugloo/control-plane:latest
```

4. Apply Terraform:

```bash
cd infra/gcp
terraform init
terraform plan
terraform apply
```

## Outputs

- `tunnel_gateway_url` - Cloud Run URL for the tunnel gateway
- `control_plane_url` - Cloud Run URL for the control plane

## Cloud SQL, Load Balancer, DNS

For full production deployment with Cloud SQL, Memorystore Redis, Load Balancer, and managed DNS, extend this Terraform configuration. See the plan for details.
