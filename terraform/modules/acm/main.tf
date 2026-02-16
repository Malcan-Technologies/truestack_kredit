variable "domain_name" {
  type = string
}

# Reuse the already-issued wildcard certificate from the shared account.
data "aws_acm_certificate" "wildcard" {
  domain      = "*.${var.domain_name}"
  statuses    = ["ISSUED"]
  types       = ["AMAZON_ISSUED"]
  most_recent = true
}

output "certificate_arn" {
  value = data.aws_acm_certificate.wildcard.arn
}

output "certificate_domain_name" {
  value = data.aws_acm_certificate.wildcard.domain
}
