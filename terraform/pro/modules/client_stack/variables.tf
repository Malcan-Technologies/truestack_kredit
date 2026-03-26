variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "shared_vpc_name" {
  type = string
}

variable "shared_alb_name" {
  type = string
}

variable "route53_zone_name" {
  type = string
}

variable "create_dns_records" {
  type    = bool
  default = false
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

variable "backend_port" {
  type    = number
  default = 4001
}

variable "admin_port" {
  type    = number
  default = 3005
}

variable "borrower_port" {
  type    = number
  default = 3000
}

variable "backend_desired_count" {
  type    = number
  default = 0
}

variable "admin_desired_count" {
  type    = number
  default = 0
}

variable "borrower_desired_count" {
  type    = number
  default = 0
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

variable "log_retention_days" {
  type    = number
  default = 14
}

# Outbound email (Resend) — used by backend_pro notifications
variable "email_from_name" {
  type    = string
  default = "TrueKredit"
}

variable "email_from_address" {
  type    = string
  default = "kredit-no-reply@send.truestack.my"
}

# TrueStack public KYC API host (non-secret; API key is in Secrets Manager)
variable "truestack_kyc_api_base_url" {
  type    = string
  default = "https://api.truestack.my"
}
