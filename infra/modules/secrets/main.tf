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
