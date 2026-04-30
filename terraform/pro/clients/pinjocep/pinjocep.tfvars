project_name = "truekredit"
environment  = "pinjocep"
aws_region   = "ap-southeast-5"

# Dedicated VPC + ALB in this account. Change dedicated_vpc_cidr if this overlaps another VPC.
networking_mode    = "dedicated"
dedicated_vpc_cidr = "10.20.0.0/16"

# If DNS is Cloudflare/external, validate ACM via output CNAME records, then point A/ALIAS/CNAME at the ALB.
# Zone matches Cloudflare (pinjocep.com.my). Set create_dns_records = true only if this zone exists in Route 53.
route53_zone_name  = "pinjocep.com.my"
create_dns_records = false

admin_domain    = "admin.pinjocep.com.my"
api_domain      = "api.pinjocep.com.my"
borrower_domain = "pinjocep.com.my"

https_api_priority      = 222
https_admin_priority    = 223
https_borrower_priority = 224
http_api_priority       = 231
http_admin_priority     = 232
http_borrower_priority  = 233

db_username = "truekredit"
db_name     = "truekredit_pro_pinjocep"

# S3 bucket names are global; plain truekredit-uploads-pinjocep was already taken elsewhere.
uploads_bucket_name = "truekredit-pinjocep-uploads-005097884744"
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

# Seed / ECS PRO_TENANT_SLUG — keep in lockstep with config/clients/pinjocep.yaml (`pro_tenant`, seed_owner_*).
pro_tenant_slug  = "sri-jeyasumi"
seed_owner_email = "jeyasumicredit@gmail.com"
seed_owner_name  = "Sri Jeyasumi"

email_from_name            = "Pinjocep"
email_from_address         = "no-reply@pinjocep.com.my"
truestack_kyc_api_base_url = "https://api.truestack.my"
