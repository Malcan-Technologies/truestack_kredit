variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "networking_mode" {
  type        = string
  description = "Use dedicated for external client accounts (Terraform creates VPC + ALB). Use shared only when reusing Truestack VPC/ALB like demo-client."
  default     = "dedicated"
}

variable "dedicated_vpc_cidr" {
  type        = string
  description = "IPv4 CIDR for the client VPC when networking_mode=dedicated."
  default     = "10.0.0.0/16"
}

variable "shared_vpc_name" {
  type        = string
  description = "When networking_mode=shared, VPC tag Name to look up."
  default     = ""
}

variable "shared_alb_name" {
  type        = string
  description = "When networking_mode=shared, existing ALB name."
  default     = ""
}

variable "route53_zone_name" {
  type = string
}

variable "create_dns_records" {
  type = bool
}

variable "admin_domain" {
  type = string
}

variable "api_domain" {
  type = string
}

variable "borrower_domain" {
  type = string
}

variable "https_api_priority" {
  type = number
}

variable "https_admin_priority" {
  type = number
}

variable "https_borrower_priority" {
  type = number
}

variable "http_api_priority" {
  type = number
}

variable "http_admin_priority" {
  type = number
}

variable "http_borrower_priority" {
  type = number
}

variable "db_username" {
  type      = string
  sensitive = true
}

variable "db_name" {
  type = string
}

variable "uploads_bucket_name" {
  type = string
}

variable "app_secret_name" {
  type = string
}

variable "backend_repository_name" {
  type = string
}

variable "admin_repository_name" {
  type = string
}

variable "borrower_repository_name" {
  type = string
}

variable "signing_gateway_repository_name" {
  type        = string
  default     = ""
  description = "ECR repo name for signing-gateway (must match config/clients YAML signing.ecr_repository)."
}

variable "cluster_name" {
  type = string
}

variable "backend_service_name" {
  type = string
}

variable "admin_service_name" {
  type = string
}

variable "borrower_service_name" {
  type = string
}

variable "migrations_task_name" {
  type = string
}

variable "pro_tenant_slug" {
  type = string
}

variable "seed_owner_email" {
  type = string
}

variable "seed_owner_name" {
  type = string
}

variable "email_from_name" {
  type    = string
  default = "Proficient Premium"
}

variable "email_from_address" {
  type    = string
  default = "no-reply@ppsb-eloan.com.my"
}

variable "truestack_kyc_api_base_url" {
  type    = string
  default = "https://api.truestack.my"
}
