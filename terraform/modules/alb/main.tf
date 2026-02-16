variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "admin_domain" {
  type = string
}

variable "api_domain" {
  type = string
}

variable "existing_alb_name" {
  type = string
}

data "aws_lb" "existing" {
  name = var.existing_alb_name
}

data "aws_lb_listener" "http" {
  load_balancer_arn = data.aws_lb.existing.arn
  port              = 80
}

data "aws_lb_listener" "https" {
  load_balancer_arn = data.aws_lb.existing.arn
  port              = 443
}

resource "aws_lb_target_group" "backend" {
  name                 = "${var.project_name}-${var.environment}-be-tg"
  port                 = 4000
  protocol             = "HTTP"
  vpc_id               = var.vpc_id
  target_type          = "ip"
  deregistration_delay = 60

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 60
    matcher             = "200"
    path                = "/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 3
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-be-tg"
  }
}

resource "aws_lb_target_group" "frontend" {
  name                 = "${var.project_name}-${var.environment}-fe-tg"
  port                 = 3000
  protocol             = "HTTP"
  vpc_id               = var.vpc_id
  target_type          = "ip"
  deregistration_delay = 60

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 60
    matcher             = "200"
    path                = "/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 3
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-fe-tg"
  }
}

resource "aws_lb_listener_rule" "http_api" {
  listener_arn = data.aws_lb_listener.http.arn
  priority     = 210

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }

  condition {
    host_header {
      values = [var.api_domain]
    }
  }
}

resource "aws_lb_listener_rule" "api" {
  listener_arn = data.aws_lb_listener.https.arn
  priority     = 200

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }

  condition {
    host_header {
      values = [var.api_domain]
    }
  }
}

resource "aws_lb_listener_rule" "admin" {
  listener_arn = data.aws_lb_listener.https.arn
  priority     = 201

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }

  condition {
    host_header {
      values = [var.admin_domain]
    }
  }
}

output "dns_name" {
  value = data.aws_lb.existing.dns_name
}

output "zone_id" {
  value = data.aws_lb.existing.zone_id
}

output "backend_target_group_arn" {
  value = aws_lb_target_group.backend.arn
}

output "frontend_target_group_arn" {
  value = aws_lb_target_group.frontend.arn
}

output "security_group_id" {
  value = tolist(data.aws_lb.existing.security_groups)[0]
}

output "listener_rules_ready" {
  value = [
    aws_lb_listener_rule.api.arn,
    aws_lb_listener_rule.admin.arn,
    aws_lb_listener_rule.http_api.arn
  ]
}
