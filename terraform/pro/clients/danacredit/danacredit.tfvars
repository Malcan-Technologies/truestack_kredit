# AWS account: 806169616799 — always run Terraform with credentials for this account
# (e.g. AWS_PROFILE=danacredit). Do not use 005097884744 (pinjocep).
#
# Legal entity (DanaCredit product / K & B GLOBAL SDN. BHD.)
# SSM / registration: PG0083736-D / 201001029932
# Address: 3A & 4B, Jalan Todak 5, Pusat Bandar Sunway, 13700 Seberang Perai, Pulau Pinang
# Moneylender licence: WL3910/07/01-10/041226 (05/12/2024 – 04/12/2026)
# Authoritative tenant fields for DB seed: config/clients/danacredit.yaml → pro_tenant

project_name = "truekredit"
environment  = "danacredit"
aws_region   = "ap-southeast-5"

networking_mode    = "dedicated"
dedicated_vpc_cidr = "10.21.0.0/16"

route53_zone_name  = "danacredit.my"
create_dns_records = false

admin_domain    = "admin.danacredit.my"
api_domain      = "api.danacredit.my"
borrower_domain = "danacredit.my"

https_api_priority      = 242
https_admin_priority    = 243
https_borrower_priority = 244
http_api_priority       = 251
http_admin_priority     = 252
http_borrower_priority  = 253

db_username = "truekredit"
db_name     = "truekredit_pro_danacredit"

uploads_bucket_name = "truekredit-danacredit-uploads-806169616799"
app_secret_name     = "truekredit-danacredit"

backend_repository_name         = "truekredit-danacredit-backend-pro"
admin_repository_name           = "truekredit-danacredit-admin-pro"
borrower_repository_name        = "truekredit-danacredit-borrower"
signing_gateway_repository_name = "truekredit-pro-signing-gateway"

cluster_name          = "truekredit-danacredit"
backend_service_name  = "truekredit-danacredit-backend"
admin_service_name    = "truekredit-danacredit-admin"
borrower_service_name = "truekredit-danacredit-borrower"
migrations_task_name  = "truekredit-danacredit-migrations"

pro_tenant_slug  = "danacredit"
seed_owner_email = "kbglobalcredit@gmail.com"
seed_owner_name  = "DanaCredit Admin"

email_from_name            = "DanaCredit"
email_from_address         = "no-reply@danacredit.my"
truestack_kyc_api_base_url = "https://api.truestack.my"

# Bootstrap signing_enabled in app secretJSON (terraform ignores secret drift after create; use CLI to change live ECS secret).
app_secret_signing_enabled = "true"
