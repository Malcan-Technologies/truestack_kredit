project_name = "truekredit"
environment  = "proficient-premium"
aws_region   = "ap-southeast-5"

# Pre-existing shared networking in the Proficient Premium AWS account.
# Provision these once via the bootstrap stack (or manually) using the same
# naming convention as demo-client. The client_stack module looks them up
# via aws_vpc / aws_lb data sources.
shared_vpc_name    = "trueidentity-prod-vpc"
shared_alb_name    = "trueidentity-prod-alb"
route53_zone_name  = "ppsb-eloan.com.my" # Only used if create_dns_records = true (Cloudflare currently owns DNS).
create_dns_records = false               # Cloudflare manages DNS for ppsb-eloan.com.my; flip to true only to let Route53 own it.

admin_domain    = "admin.ppsb-eloan.com.my"
api_domain      = "api.ppsb-eloan.com.my"
borrower_domain = "ppsb-eloan.com.my"

# ALB listener rule priorities. PP has its own ALB, so these can match
# the demo-client values (different ALB = no collision).
https_api_priority      = 202
https_admin_priority    = 203
https_borrower_priority = 204
http_api_priority       = 211
http_admin_priority     = 212
http_borrower_priority  = 213

db_username = "truekredit"
db_name     = "truekredit_pro_proficient_premium"

uploads_bucket_name = "truekredit-uploads-proficient-premium"
app_secret_name     = "truekredit-proficient-premium"

backend_repository_name  = "truekredit-proficient-premium-backend-pro"
admin_repository_name    = "truekredit-proficient-premium-admin-pro"
borrower_repository_name = "truekredit-proficient-premium-borrower"

cluster_name          = "truekredit-proficient-premium"
backend_service_name  = "truekredit-proficient-premium-backend"
admin_service_name    = "truekredit-proficient-premium-admin"
borrower_service_name = "truekredit-proficient-premium-borrower"
migrations_task_name  = "truekredit-proficient-premium-migrations"

pro_tenant_slug  = "proficient-premium"
seed_owner_email = "admin@ppsb-eloan.com.my" # TODO: confirm real seed owner address
seed_owner_name  = "Proficient Premium Owner"

# backend_pro .env parity (non-secret values; secrets live in AWS Secrets Manager)
email_from_name            = "Proficient Premium"
email_from_address         = "no-reply@ppsb-eloan.com.my"
truestack_kyc_api_base_url = "https://api.truestack.my"
