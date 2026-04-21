output "cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "backend_service_name" {
  value = aws_ecs_service.backend.name
}

output "admin_service_name" {
  value = aws_ecs_service.admin.name
}

output "borrower_service_name" {
  value = aws_ecs_service.borrower.name
}

output "migrations_task_name" {
  value = aws_ecs_task_definition.migrations.family
}

output "backend_repository_url" {
  value = aws_ecr_repository.backend.repository_url
}

output "admin_repository_url" {
  value = aws_ecr_repository.admin.repository_url
}

output "borrower_repository_url" {
  value = aws_ecr_repository.borrower.repository_url
}

output "signing_gateway_repository_url" {
  value       = try(aws_ecr_repository.signing_gateway[0].repository_url, "")
  description = "ECR URL for signing-gateway image when signing_gateway_repository_name is set."
}

output "app_secret_arn" {
  value = aws_secretsmanager_secret.app.arn
}

output "uploads_bucket_name" {
  value = aws_s3_bucket.uploads.id
}

output "alb_dns_name" {
  description = "Public ALB hostname (use as Route53/Cloudflare alias or CNAME target)."
  value       = local.alb_dns_name
}

output "networking_mode" {
  value = var.networking_mode
}

output "acm_certificate_validation_records" {
  description = "When networking_mode=dedicated, add these CNAME records at your DNS provider so ACM can validate; required before HTTPS listener can be created."
  value = var.networking_mode == "dedicated" ? [
    for dvo in aws_acm_certificate.dedicated[0].domain_validation_options : {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  ] : []
}

output "rds_endpoint" {
  value = aws_db_instance.main.endpoint
}

output "ecs_security_group_id" {
  value = aws_security_group.ecs.id
}
