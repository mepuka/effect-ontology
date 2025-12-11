# Reference existing secret (created manually or via gcloud)
data "google_secret_manager_secret" "anthropic_api_key" {
  secret_id = "ANTHROPIC_API_KEY"
}

# Grant access to the secret for the Cloud Run service account
resource "google_secret_manager_secret_iam_member" "cloud_run_access" {
  secret_id = data.google_secret_manager_secret.anthropic_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.cloud_run_sa}"
}

# PostgreSQL password secret for workflow persistence
resource "google_secret_manager_secret" "postgres_password" {
  count     = var.enable_postgres ? 1 : 0
  secret_id = "POSTGRES_PASSWORD"

  replication {
    auto {}
  }
}

# Generate random password for PostgreSQL
resource "random_password" "postgres_password" {
  count   = var.enable_postgres ? 1 : 0
  length  = 32
  special = false
}

# Store password in secret
resource "google_secret_manager_secret_version" "postgres_password" {
  count       = var.enable_postgres ? 1 : 0
  secret      = google_secret_manager_secret.postgres_password[0].id
  secret_data = random_password.postgres_password[0].result
}

# Grant Compute Engine SA access to PostgreSQL password
resource "google_secret_manager_secret_iam_member" "postgres_access" {
  count     = var.enable_postgres ? 1 : 0
  secret_id = google_secret_manager_secret.postgres_password[0].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.cloud_run_sa}"
}
