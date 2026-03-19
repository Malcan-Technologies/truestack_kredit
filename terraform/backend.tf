terraform {
  backend "s3" {
    bucket                 = "truestack-terraform-state-491694399426"
    key                    = "truekredit/prod/terraform.tfstate"
    region                 = "ap-southeast-5"
    dynamodb_table         = "truestack-terraform-locks"
    encrypt                = true
    skip_region_validation = true
    profile                = "truestack"
  }
}
