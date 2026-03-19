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
  region  = var.aws_region
  profile = "truestack"

  default_tags {
    tags = {
      Project     = "TrueKredit"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

locals {
  admin_domain  = "${var.admin_subdomain}.${var.domain_name}"
  api_domain    = "${var.api_subdomain}.${var.domain_name}"
  frontend_url  = "https://${local.admin_domain}"
  api_url       = "https://${local.api_domain}"
  app_secret_id = "${var.project_name}-${var.environment}"
}

# Read outputs from admin-truestack terraform state to reuse shared network.
data "terraform_remote_state" "admin_truestack" {
  backend = "s3"
  config = {
    bucket                 = var.shared_state_bucket
    key                    = var.shared_state_key
    region                 = var.aws_region
    dynamodb_table         = var.shared_state_lock_table
    encrypt                = true
    skip_region_validation = true
  }
}

data "aws_vpc" "shared" {
  filter {
    name   = "tag:Name"
    values = [var.shared_vpc_name]
  }
}

data "aws_subnets" "public" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.shared.id]
  }

  filter {
    name   = "tag:Type"
    values = ["public"]
  }
}

data "aws_subnets" "private" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.shared.id]
  }

  filter {
    name   = "tag:Type"
    values = ["private"]
  }
}

locals {
  private_subnet_ids = try(data.terraform_remote_state.admin_truestack.outputs.private_subnets, data.aws_subnets.private.ids)
}

data "aws_secretsmanager_secret" "app" {
  name = local.app_secret_id
}

module "acm" {
  source = "./modules/acm"

  domain_name = var.domain_name
}

module "alb" {
  source = "./modules/alb"

  project_name      = var.project_name
  environment       = var.environment
  vpc_id            = data.aws_vpc.shared.id
  admin_domain      = local.admin_domain
  api_domain        = local.api_domain
  existing_alb_name = var.shared_alb_name
}

module "s3" {
  source = "./modules/s3"

  project_name = var.project_name
  environment  = var.environment
}

module "ecs" {
  source = "./modules/ecs"

  project_name                = var.project_name
  environment                 = var.environment
  aws_region                  = var.aws_region
  vpc_id                      = data.aws_vpc.shared.id
  private_subnet_ids          = local.private_subnet_ids
  alb_security_group_id       = module.alb.security_group_id
  backend_target_group_arn    = module.alb.backend_target_group_arn
  frontend_target_group_arn   = module.alb.frontend_target_group_arn
  backend_ecr_repository_url  = var.backend_ecr_repository_url
  frontend_ecr_repository_url = var.frontend_ecr_repository_url
  image_tag                   = var.image_tag
  backend_desired_count       = var.backend_desired_count
  frontend_desired_count      = var.frontend_desired_count
  frontend_url                = local.frontend_url
  api_url                     = local.api_url
  s3_bucket                   = module.s3.bucket_name
  secrets_arn                 = data.aws_secretsmanager_secret.app.arn

  depends_on = [module.alb]
}

module "rds" {
  source = "./modules/rds"

  project_name       = var.project_name
  environment        = var.environment
  vpc_id             = data.aws_vpc.shared.id
  private_subnet_ids = local.private_subnet_ids
  ecs_security_group = module.ecs.security_group_id
  db_username        = var.db_username
  db_name            = var.db_name
}
