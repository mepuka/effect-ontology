output "anthropic_secret_id" {
  value = data.google_secret_manager_secret.anthropic_api_key.secret_id
}
