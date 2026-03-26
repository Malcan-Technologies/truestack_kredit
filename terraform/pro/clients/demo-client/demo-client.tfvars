project_name = "truekredit"
environment  = "demo-client"
aws_region   = "ap-southeast-5"

shared_vpc_name    = "trueidentity-prod-vpc"
shared_alb_name    = "trueidentity-prod-alb"
route53_zone_name  = "truestack.my"
create_dns_records = false

admin_domain    = "demo-admin.truestack.my"
api_domain      = "demo-api.truestack.my"
borrower_domain = "demo.truestack.my"

https_api_priority      = 202
https_admin_priority    = 203
https_borrower_priority = 204
http_api_priority       = 211
http_admin_priority     = 212
http_borrower_priority  = 213

db_username = "truekredit"
db_name     = "truekredit_pro_demo"

uploads_bucket_name = "truekredit-uploads-demo-client"
app_secret_name     = "truekredit-demo-client"

backend_repository_name  = "truekredit-demo-client-backend-pro"
admin_repository_name    = "truekredit-demo-client-admin-pro"
borrower_repository_name = "truekredit-demo-client-borrower"

cluster_name          = "truekredit-demo-client"
backend_service_name  = "truekredit-demo-client-backend"
admin_service_name    = "truekredit-demo-client-admin"
borrower_service_name = "truekredit-demo-client-borrower"
migrations_task_name  = "truekredit-demo-client-migrations"

pro_tenant_slug  = "demo-company"
seed_owner_email = "admin@demo.com"
seed_owner_name  = "Demo Owner"
