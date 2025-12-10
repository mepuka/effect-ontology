variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment (dev/prod)"
  type        = string
}

variable "image" {
  description = "Docker image to deploy"
  type        = string
}

variable "allow_unauthenticated" {
  description = "Allow public access to Cloud Run service"
  type        = bool
  default     = false
}
