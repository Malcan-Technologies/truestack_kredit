# Wiring shared (Truestack) vs dedicated (client account) networking into a single set of locals.

locals {
  vpc_id = var.networking_mode == "dedicated" ? aws_vpc.dedicated[0].id : data.aws_vpc.shared[0].id

  private_subnet_ids = var.networking_mode == "dedicated" ? aws_subnet.dedicated_private[*].id : data.aws_subnets.private[0].ids

  # Dedicated: public subnets + public task IPs avoid NAT cost. Shared: existing private subnets + NAT.
  ecs_subnet_ids = var.networking_mode == "dedicated" ? aws_subnet.dedicated_public[*].id : data.aws_subnets.private[0].ids

  ecs_assign_public_ip = var.networking_mode == "dedicated"

  https_listener_arn = var.networking_mode == "dedicated" ? aws_lb_listener.dedicated_https[0].arn : data.aws_lb_listener.https[0].arn

  http_listener_arn = var.networking_mode == "dedicated" ? aws_lb_listener.dedicated_http[0].arn : data.aws_lb_listener.http[0].arn

  alb_dns_name = var.networking_mode == "dedicated" ? aws_lb.dedicated[0].dns_name : data.aws_lb.shared[0].dns_name

  alb_zone_id = var.networking_mode == "dedicated" ? aws_lb.dedicated[0].zone_id : data.aws_lb.shared[0].zone_id

  alb_ingress_security_group_ids = var.networking_mode == "dedicated" ? [aws_security_group.dedicated_alb[0].id] : tolist(data.aws_lb.shared[0].security_groups)
}
