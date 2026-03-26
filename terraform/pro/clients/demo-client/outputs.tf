output "cluster_name" {
  value = module.client_stack.cluster_name
}

output "backend_service_name" {
  value = module.client_stack.backend_service_name
}

output "admin_service_name" {
  value = module.client_stack.admin_service_name
}

output "borrower_service_name" {
  value = module.client_stack.borrower_service_name
}

output "migrations_task_name" {
  value = module.client_stack.migrations_task_name
}

output "backend_repository_url" {
  value = module.client_stack.backend_repository_url
}

output "admin_repository_url" {
  value = module.client_stack.admin_repository_url
}

output "borrower_repository_url" {
  value = module.client_stack.borrower_repository_url
}

output "app_secret_arn" {
  value = module.client_stack.app_secret_arn
}

output "uploads_bucket_name" {
  value = module.client_stack.uploads_bucket_name
}

output "alb_dns_name" {
  value = module.client_stack.alb_dns_name
}

output "rds_endpoint" {
  value = module.client_stack.rds_endpoint
}
