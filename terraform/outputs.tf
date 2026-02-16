output "admin_domain" {
  description = "Frontend admin domain."
  value       = "${var.admin_subdomain}.${var.domain_name}"
}

output "api_domain" {
  description = "Backend API domain."
  value       = "${var.api_subdomain}.${var.domain_name}"
}

output "alb_dns_name" {
  description = "ALB DNS name for DNS CNAME records."
  value       = module.alb.dns_name
}

output "s3_bucket_name" {
  description = "S3 bucket used for uploaded files."
  value       = module.s3.bucket_name
}

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = module.ecs.cluster_name
}

output "ecs_backend_service_name" {
  description = "ECS backend service name."
  value       = module.ecs.backend_service_name
}

output "ecs_frontend_service_name" {
  description = "ECS frontend service name."
  value       = module.ecs.frontend_service_name
}

output "migration_task_definition_arn" {
  description = "ECS migration task definition ARN."
  value       = module.ecs.migration_task_definition_arn
}

output "ecs_security_group_id" {
  description = "Security group ID used by ECS tasks."
  value       = module.ecs.security_group_id
}

output "private_subnet_ids" {
  description = "Private subnet IDs used by ECS tasks."
  value       = module.ecs.private_subnet_ids
}

output "rds_endpoint" {
  description = "RDS endpoint."
  value       = module.rds.endpoint
}

output "rds_master_user_secret_arn" {
  description = "RDS managed master user secret ARN."
  value       = module.rds.master_user_secret_arn
}

output "database_url_template" {
  description = "Template for DATABASE_URL (replace <PASSWORD>)."
  value       = "postgresql://${var.db_username}:<PASSWORD>@${module.rds.endpoint}/${module.rds.db_name}"
  sensitive   = true
}

output "dns_records" {
  description = "DNS CNAME records to create."
  value       = <<-EOT
    Create these DNS records:
    ${var.admin_subdomain}.${var.domain_name} -> ${module.alb.dns_name}
    ${var.api_subdomain}.${var.domain_name} -> ${module.alb.dns_name}
  EOT
}
