project_name = "truekredit"
environment  = "pinjocep"
aws_region   = "ap-southeast-5"

# Dedicated VPC + ALB in this account. Change dedicated_vpc_cidr if this overlaps another VPC.
networking_mode    = "dedicated"
dedicated_vpc_cidr = "10.20.0.0/16"

# If DNS is Cloudflare/external, validate ACM via output CNAME records, then point A/ALIAS/CNAME at the ALB.
# Parent zone for DNS (adjust if your zone is delegated differently, e.g. only loans.pinjocep.com).
route53_zone_name  = "pinjocep.com"
create_dns_records = false

admin_domain    = "admin.loans.pinjocep.com"
api_domain      = "api.loans.pinjocep.com"
borrower_domain = "loans.pinjocep.com"

https_api_priority      = 222
https_admin_priority    = 223
https_borrower_priority = 224
http_api_priority       = 231
http_admin_priority     = 232
http_borrower_priority  = 233

db_username = "truekredit"
db_name     = "truekredit_pro_pinjocep"

uploads_bucket_name = "truekredit-uploads-pinjocep"
app_secret_name     = "truekredit-pinjocep"

backend_repository_name         = "truekredit-pinjocep-backend-pro"
admin_repository_name           = "truekredit-pinjocep-admin-pro"
borrower_repository_name        = "truekredit-pinjocep-borrower"
signing_gateway_repository_name = "truekredit-pro-signing-gateway"

cluster_name          = "truekredit-pinjocep"
backend_service_name  = "truekredit-pinjocep-backend"
admin_service_name    = "truekredit-pinjocep-admin"
borrower_service_name = "truekredit-pinjocep-borrower"
migrations_task_name  = "truekredit-pinjocep-migrations"

pro_tenant_slug  = "pinjocep"
seed_owner_email = "admin@pinjocep.com"
seed_owner_name  = "Pinjocep Owner"

email_from_name            = "Pinjocep"
email_from_address         = "no-reply@pinjocep.com"
truestack_kyc_api_base_url = "https://api.truestack.my"
