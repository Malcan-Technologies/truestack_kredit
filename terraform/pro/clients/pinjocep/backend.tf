terraform {
  # Remote state in the same account pattern as demo-client. Bootstrap once per account if missing:
  #   - S3 bucket: truestack-terraform-state-<account_id> (versioned + encrypted)
  #   - DynamoDB:  truestack-terraform-locks (LockID hash key, on-demand)
  #
  # For a client-owned AWS account, change bucket/key to match that account’s state bootstrap
  # (see terraform/pro/clients/proficient-premium/backend.tf).
  backend "s3" {
    bucket                 = "truestack-terraform-state-491694399426"
    key                    = "truekredit/pro/pinjocep/terraform.tfstate"
    region                 = "ap-southeast-5"
    dynamodb_table         = "truestack-terraform-locks"
    encrypt                = true
    skip_region_validation = true
  }
}
