output "anthropic_secret_id" {
  value = data.google_secret_manager_secret.anthropic_api_key.secret_id
}

output "postgres_password_secret_id" {
  value       = var.enable_postgres ? google_secret_manager_secret.postgres_password[0].secret_id : null
  description = "Secret ID for PostgreSQL password"
}

output "postgres_password" {
  value       = var.enable_postgres ? random_password.postgres_password[0].result : null
  sensitive   = true
  description = "PostgreSQL password (sensitive)"
}
