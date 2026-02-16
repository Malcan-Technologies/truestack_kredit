project_name = "truekredit"
environment  = "prod"
aws_region   = "ap-southeast-5"

domain_name     = "truestack.my"
admin_subdomain = "kredit"
api_subdomain   = "kredit-api"
enable_https    = true

db_username = "truekredit"
db_name     = "truekredit"

backend_ecr_repository_url  = "491694399426.dkr.ecr.ap-southeast-5.amazonaws.com/truekredit-backend"
frontend_ecr_repository_url = "491694399426.dkr.ecr.ap-southeast-5.amazonaws.com/truekredit-frontend"
image_tag                   = "latest"

backend_desired_count  = 1
frontend_desired_count = 1

shared_vpc_name         = "trueidentity-prod-vpc"
shared_alb_name         = "trueidentity-prod-alb"
shared_state_bucket     = "truestack-terraform-state-491694399426"
shared_state_key        = "trueidentity/prod/terraform.tfstate"
shared_state_lock_table = "truestack-terraform-locks"
