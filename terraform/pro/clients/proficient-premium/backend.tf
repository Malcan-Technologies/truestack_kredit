terraform {
  # Remote state for the Proficient Premium Pro stack.
  # The S3 bucket and DynamoDB lock table must already exist in the
  # Proficient Premium AWS account (872891100129) and region (ap-southeast-5).
  #
  # Recommended bootstrap (run once per AWS account, before `terraform init`):
  #   - S3 bucket: truestack-terraform-state-872891100129 (versioned + encrypted)
  #   - DynamoDB:  truestack-terraform-locks (LockID hash key, on-demand)
  backend "s3" {
    bucket                 = "truestack-terraform-state-872891100129"
    key                    = "truekredit/pro/proficient-premium/terraform.tfstate"
    region                 = "ap-southeast-5"
    dynamodb_table         = "truestack-terraform-locks"
    encrypt                = true
    skip_region_validation = true
  }
}
