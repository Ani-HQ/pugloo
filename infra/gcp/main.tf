terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

variable "project_id" {
  type        = string
  description = "GCP project ID"
}

variable "region" {
  type        = string
  default     = "us-central1"
  description = "GCP region"
}

variable "tunnel_host" {
  type        = string
  default     = "tunnel.pugloo.dev"
  description = "Tunnel subdomain host (e.g. xxx.tunnel.pugloo.dev)"
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# Artifact Registry for container images
resource "google_artifact_registry_repository" "pugloo" {
  location      = var.region
  repository_id = "pugloo"
  description   = "Pugloo container images"
  format        = "DOCKER"
}

# Cloud Run - Tunnel Gateway
resource "google_cloud_run_v2_service" "tunnel_gateway" {
  name     = "tunnel-gateway"
  location = var.region

  template {
    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/pugloo/tunnel-gateway:latest"

      env {
        name  = "TUNNEL_HOST"
        value = var.tunnel_host
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }

    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
}

# Cloud Run - Control Plane
resource "google_cloud_run_v2_service" "control_plane" {
  name     = "control-plane"
  location = var.region

  template {
    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/pugloo/control-plane:latest"

      resources {
        limits = {
          cpu    = "1"
          memory = "256Mi"
        }
      }
    }

    scaling {
      min_instance_count = 0
      max_instance_count = 5
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
}

output "tunnel_gateway_url" {
  value = google_cloud_run_v2_service.tunnel_gateway.uri
}

output "control_plane_url" {
  value = google_cloud_run_v2_service.control_plane.uri
}
