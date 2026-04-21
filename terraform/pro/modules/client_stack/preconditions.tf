resource "terraform_data" "networking_validation" {
  lifecycle {
    precondition {
      condition     = var.networking_mode != "shared" || (length(var.shared_vpc_name) > 0 && length(var.shared_alb_name) > 0)
      error_message = "When networking_mode is \"shared\", set shared_vpc_name and shared_alb_name (see terraform/pro/clients/demo-client/demo-client.tfvars)."
    }
  }
}
