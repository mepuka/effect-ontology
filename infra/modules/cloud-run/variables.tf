variable "project_id" {
  type = string
}

variable "environment" {
  type = string
}

variable "region" {
  type = string
}

variable "image" {
  type = string
}

variable "storage_bucket" {
  type = string
}

variable "anthropic_secret_id" {
  type = string
}

variable "cloud_run_sa" {
  type = string
}

variable "allow_unauthenticated" {
  type    = bool
  default = false
}

variable "ontology_path" {
  type        = string
  description = "Path to ontology file inside the container (absolute path)"
  default     = "/app/ontologies/football/ontology_skos.ttl"
}

# PostgreSQL configuration for @effect/workflow persistence
variable "enable_postgres" {
  type        = bool
  description = "Enable PostgreSQL environment variables for workflow persistence"
  default     = false
}

variable "vpc_connector_id" {
  type        = string
  description = "VPC Connector ID for Cloud Run to access private network"
  default     = null
}

variable "postgres_host" {
  type        = string
  description = "PostgreSQL host IP address"
  default     = null
}

variable "postgres_password_secret_id" {
  type        = string
  description = "Secret Manager secret ID for PostgreSQL password"
  default     = null
}
