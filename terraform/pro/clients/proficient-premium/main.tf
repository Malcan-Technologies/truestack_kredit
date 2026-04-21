terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "TrueKredit"
      Environment = var.environment
      ManagedBy   = "Terraform"
      Product     = "TrueKreditPro"
      Client      = "proficient-premium"
    }
  }
}

module "client_stack" {
  source = "../../modules/client_stack"

  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region

  networking_mode    = var.networking_mode
  dedicated_vpc_cidr = var.dedicated_vpc_cidr
  shared_vpc_name    = var.shared_vpc_name
  shared_alb_name    = var.shared_alb_name
  route53_zone_name  = var.route53_zone_name
  create_dns_records = var.create_dns_records

  admin_domain    = var.admin_domain
  api_domain      = var.api_domain
  borrower_domain = var.borrower_domain

  https_api_priority      = var.https_api_priority
  https_admin_priority    = var.https_admin_priority
  https_borrower_priority = var.https_borrower_priority
  http_api_priority       = var.http_api_priority
  http_admin_priority     = var.http_admin_priority
  http_borrower_priority  = var.http_borrower_priority

  db_username = var.db_username
  db_name     = var.db_name

  uploads_bucket_name = var.uploads_bucket_name
  app_secret_name     = var.app_secret_name

  backend_repository_name  = var.backend_repository_name
  admin_repository_name    = var.admin_repository_name
  borrower_repository_name = var.borrower_repository_name
  signing_gateway_repository_name = var.signing_gateway_repository_name

  cluster_name          = var.cluster_name
  backend_service_name  = var.backend_service_name
  admin_service_name    = var.admin_service_name
  borrower_service_name = var.borrower_service_name
  migrations_task_name  = var.migrations_task_name

  pro_tenant_slug  = var.pro_tenant_slug
  seed_owner_email = var.seed_owner_email
  seed_owner_name  = var.seed_owner_name

  email_from_name            = var.email_from_name
  email_from_address         = var.email_from_address
  truestack_kyc_api_base_url = var.truestack_kyc_api_base_url
}
