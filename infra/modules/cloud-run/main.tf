resource "google_cloud_run_v2_service" "main" {
  name     = "effect-ontology-core-${var.environment}"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = var.cloud_run_sa

    # VPC access for PostgreSQL connectivity (when enabled)
    dynamic "vpc_access" {
      for_each = var.vpc_connector_id != null ? [1] : []
      content {
        connector = var.vpc_connector_id
        egress    = "PRIVATE_RANGES_ONLY"
      }
    }

    containers {
      image = var.image

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "STORAGE_TYPE"
        value = "gcs"
      }
      env {
        name  = "STORAGE_BUCKET"
        value = var.storage_bucket
      }
      env {
        name  = "LLM_PROVIDER"
        value = "anthropic"
      }
      env {
        name  = "LLM_MODEL"
        value = "claude-haiku-4-5"
      }
      env {
        name  = "ONTOLOGY_PATH"
        value = var.ontology_path
      }
      env {
        name = "LLM_API_KEY"
        value_source {
          secret_key_ref {
            secret  = var.anthropic_secret_id
            version = "latest"
          }
        }
      }

      # PostgreSQL environment variables (when enabled)
      dynamic "env" {
        for_each = var.enable_postgres ? [1] : []
        content {
          name  = "POSTGRES_HOST"
          value = var.postgres_host
        }
      }
      dynamic "env" {
        for_each = var.enable_postgres ? [1] : []
        content {
          name  = "POSTGRES_PORT"
          value = "5432"
        }
      }
      dynamic "env" {
        for_each = var.enable_postgres ? [1] : []
        content {
          name  = "POSTGRES_DATABASE"
          value = "workflow"
        }
      }
      dynamic "env" {
        for_each = var.enable_postgres ? [1] : []
        content {
          name  = "POSTGRES_USER"
          value = "workflow"
        }
      }
      dynamic "env" {
        for_each = var.enable_postgres ? [1] : []
        content {
          name = "POSTGRES_PASSWORD"
          value_source {
            secret_key_ref {
              secret  = var.postgres_password_secret_id
              version = "latest"
            }
          }
        }
      }
      dynamic "env" {
        for_each = var.enable_postgres ? [1] : []
        content {
          name  = "POSTGRES_SSL"
          value = "false" # Internal VPC traffic, SSL not required
        }
      }
      dynamic "env" {
        for_each = var.enable_postgres ? [1] : []
        content {
          name  = "WORKFLOW_PERSISTENCE"
          value = "postgres"
        }
      }
    }

    scaling {
      min_instance_count = 0
      max_instance_count = var.environment == "prod" ? 10 : 2
    }

    timeout = "300s"
  }
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  count    = var.allow_unauthenticated ? 1 : 0
  location = google_cloud_run_v2_service.main.location
  name     = google_cloud_run_v2_service.main.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
