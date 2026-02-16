variable "project_name" {
  description = "Project name."
  type        = string
  default     = "truekredit"
}

variable "environment" {
  description = "Environment name."
  type        = string
  default     = "prod"
}

variable "aws_region" {
  description = "AWS region."
  type        = string
  default     = "ap-southeast-5"
}

variable "domain_name" {
  description = "Base domain name."
  type        = string
  default     = "truestack.my"
}

variable "admin_subdomain" {
  description = "Admin frontend subdomain."
  type        = string
  default     = "kredit"
}

variable "api_subdomain" {
  description = "API subdomain."
  type        = string
  default     = "kredit-api"
}

variable "enable_https" {
  description = "Enable HTTPS listener and host-based routing."
  type        = bool
  default     = true
}

variable "db_username" {
  description = "RDS master username."
  type        = string
  default     = "truekredit"
  sensitive   = true
}

variable "db_name" {
  description = "Application database name."
  type        = string
  default     = "truekredit"
}

variable "backend_ecr_repository_url" {
  description = "ECR repository URL for backend image."
  type        = string
  default     = "491694399426.dkr.ecr.ap-southeast-5.amazonaws.com/truekredit-backend"
}

variable "frontend_ecr_repository_url" {
  description = "ECR repository URL for frontend image."
  type        = string
  default     = "491694399426.dkr.ecr.ap-southeast-5.amazonaws.com/truekredit-frontend"
}

variable "image_tag" {
  description = "Docker image tag to deploy."
  type        = string
  default     = "latest"
}

variable "backend_desired_count" {
  description = "Desired ECS task count for backend."
  type        = number
  default     = 1
}

variable "frontend_desired_count" {
  description = "Desired ECS task count for frontend."
  type        = number
  default     = 1
}

variable "shared_vpc_name" {
  description = "Existing VPC name from admin-truestack project."
  type        = string
  default     = "trueidentity-prod-vpc"
}

variable "shared_alb_name" {
  description = "Existing ALB name from admin-truestack project."
  type        = string
  default     = "trueidentity-prod-alb"
}

variable "shared_state_bucket" {
  description = "S3 bucket containing admin-truestack terraform state."
  type        = string
  default     = "truestack-terraform-state-491694399426"
}

variable "shared_state_key" {
  description = "S3 object key for admin-truestack terraform state."
  type        = string
  default     = "trueidentity/prod/terraform.tfstate"
}

variable "shared_state_lock_table" {
  description = "DynamoDB lock table used by shared state."
  type        = string
  default     = "truestack-terraform-locks"
}
