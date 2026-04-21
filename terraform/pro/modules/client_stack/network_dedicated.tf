# Dedicated VPC + internet-facing ALB + ACM for external Pro clients (own AWS account).
# ECS tasks run in public subnets with assign_public_ip=true so ECR pulls work without a NAT gateway.
# RDS uses private subnets only.

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  # ALB requires subnets in at least two AZs.
  dedicated_azs = slice(data.aws_availability_zones.available.names, 0, 2)
}

resource "aws_vpc" "dedicated" {
  count = var.networking_mode == "dedicated" ? 1 : 0

  cidr_block           = var.dedicated_vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(local.common_tags, {
    Name = "${var.cluster_name}-vpc"
  })
}

resource "aws_internet_gateway" "dedicated" {
  count = var.networking_mode == "dedicated" ? 1 : 0

  vpc_id = aws_vpc.dedicated[0].id

  tags = merge(local.common_tags, {
    Name = "${var.cluster_name}-igw"
  })
}

resource "aws_subnet" "dedicated_public" {
  count = var.networking_mode == "dedicated" ? 2 : 0

  vpc_id                  = aws_vpc.dedicated[0].id
  cidr_block              = cidrsubnet(var.dedicated_vpc_cidr, 8, count.index)
  availability_zone       = local.dedicated_azs[count.index]
  map_public_ip_on_launch = true

  tags = merge(local.common_tags, {
    Name = "${var.cluster_name}-public-${count.index + 1}"
    Type = "public"
  })
}

resource "aws_subnet" "dedicated_private" {
  count = var.networking_mode == "dedicated" ? 2 : 0

  vpc_id            = aws_vpc.dedicated[0].id
  cidr_block        = cidrsubnet(var.dedicated_vpc_cidr, 8, count.index + 10)
  availability_zone = local.dedicated_azs[count.index]

  tags = merge(local.common_tags, {
    Name = "${var.cluster_name}-private-${count.index + 1}"
    Type = "private"
  })
}

resource "aws_route_table" "dedicated_public" {
  count = var.networking_mode == "dedicated" ? 1 : 0

  vpc_id = aws_vpc.dedicated[0].id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.dedicated[0].id
  }

  tags = merge(local.common_tags, {
    Name = "${var.cluster_name}-public-rt"
  })
}

resource "aws_route_table_association" "dedicated_public" {
  count = var.networking_mode == "dedicated" ? 2 : 0

  subnet_id      = aws_subnet.dedicated_public[count.index].id
  route_table_id = aws_route_table.dedicated_public[0].id
}

resource "aws_route_table" "dedicated_private" {
  count = var.networking_mode == "dedicated" ? 1 : 0

  vpc_id = aws_vpc.dedicated[0].id

  tags = merge(local.common_tags, {
    Name = "${var.cluster_name}-private-rt"
  })
}

resource "aws_route_table_association" "dedicated_private" {
  count = var.networking_mode == "dedicated" ? 2 : 0

  subnet_id      = aws_subnet.dedicated_private[count.index].id
  route_table_id = aws_route_table.dedicated_private[0].id
}

resource "aws_security_group" "dedicated_alb" {
  count = var.networking_mode == "dedicated" ? 1 : 0

  name        = "${var.cluster_name}-alb-sg"
  description = "Internet-facing ALB for ${var.cluster_name}"
  vpc_id      = aws_vpc.dedicated[0].id

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP (redirect to HTTPS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${var.cluster_name}-alb-sg"
  })
}

resource "aws_lb" "dedicated" {
  count = var.networking_mode == "dedicated" ? 1 : 0

  # ALB name max 32 characters
  name               = substr("${var.cluster_name}-alb", 0, 32)
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.dedicated_alb[0].id]
  subnets            = aws_subnet.dedicated_public[*].id

  enable_deletion_protection = false

  tags = merge(local.common_tags, {
    Name = "${var.cluster_name}-alb"
  })
}

resource "aws_acm_certificate" "dedicated" {
  count = var.networking_mode == "dedicated" ? 1 : 0

  domain_name               = var.api_domain
  subject_alternative_names = distinct(compact([var.admin_domain, var.borrower_domain]))
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(local.common_tags, {
    Name = "${var.cluster_name}-cert"
  })
}

resource "aws_acm_certificate_validation" "dedicated" {
  count = var.networking_mode == "dedicated" ? 1 : 0

  certificate_arn = aws_acm_certificate.dedicated[0].arn

  timeouts {
    create = "45m"
  }
}

resource "aws_lb_listener" "dedicated_http" {
  count = var.networking_mode == "dedicated" ? 1 : 0

  load_balancer_arn = aws_lb.dedicated[0].arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }

  depends_on = [aws_lb.dedicated]
}

resource "aws_lb_listener" "dedicated_https" {
  count = var.networking_mode == "dedicated" ? 1 : 0

  load_balancer_arn = aws_lb.dedicated[0].arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.dedicated[0].certificate_arn

  default_action {
    type = "fixed-response"

    fixed_response {
      content_type = "text/plain"
      message_body = "Not Found"
      status_code  = "404"
    }
  }

  depends_on = [
    aws_lb.dedicated,
    aws_acm_certificate_validation.dedicated,
  ]
}
