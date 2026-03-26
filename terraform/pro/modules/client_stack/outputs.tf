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

output "app_secret_arn" {
  value = aws_secretsmanager_secret.app.arn
}

output "uploads_bucket_name" {
  value = aws_s3_bucket.uploads.id
}

output "alb_dns_name" {
  value = data.aws_lb.shared.dns_name
}

output "rds_endpoint" {
  value = aws_db_instance.main.endpoint
}

output "ecs_security_group_id" {
  value = aws_security_group.ecs.id
}
