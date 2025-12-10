output "service_url" {
  value = module.cloud_run.service_url
}

output "bucket_name" {
  value = module.storage.bucket_name
}
