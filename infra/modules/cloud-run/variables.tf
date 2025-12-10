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
