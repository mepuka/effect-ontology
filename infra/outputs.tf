output "service_url" {
  value = module.cloud_run.service_url
}

output "bucket_name" {
  value = module.storage.bucket_name
}

output "postgres_connection_string" {
  value       = var.enable_postgres ? module.postgres[0].postgres_connection_string : null
  sensitive   = true
  description = "PostgreSQL connection string (without password)"
}

output "postgres_internal_ip" {
  value       = var.enable_postgres ? module.postgres[0].postgres_internal_ip : null
  description = "Internal IP of PostgreSQL instance"
}

output "vpc_connector_name" {
  value       = var.enable_postgres ? module.postgres[0].vpc_connector_name : null
  description = "VPC connector for Cloud Run to PostgreSQL"
}
