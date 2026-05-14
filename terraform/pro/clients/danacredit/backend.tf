# Remote state must live in the DanaCredit AWS account only (806169616799).
# Use: AWS_PROFILE=danacredit terraform init|plan|apply (not pinjocep / 005097884744).
terraform {
  backend "s3" {
    bucket                 = "truestack-terraform-state-806169616799"
    key                    = "truekredit/pro/danacredit/terraform.tfstate"
    region                 = "ap-southeast-5"
    dynamodb_table         = "truestack-terraform-locks"
    encrypt                = true
    skip_region_validation = true
  }
}
