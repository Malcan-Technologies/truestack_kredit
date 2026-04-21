# Interface + gateway VPC endpoints for dedicated external-client stacks so Fargate can reach
# Secrets Manager, ECR, Logs, and S3 without relying on long-haul internet paths (avoids
# ResourceInitializationError timeouts when pulling secrets / images during task start).
# Only created when networking_mode = "dedicated".

resource "aws_security_group" "vpc_endpoints" {
  count = var.networking_mode == "dedicated" ? 1 : 0

  name        = "${var.cluster_name}-vpce-sg"
  description = "HTTPS from ECS tasks to AWS interface VPC endpoints"
  vpc_id      = aws_vpc.dedicated[0].id

  ingress {
    description     = "HTTPS from ECS tasks"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${var.cluster_name}-vpce-sg"
  })
}

resource "aws_vpc_endpoint" "interface" {
  for_each = var.networking_mode == "dedicated" ? toset([
    "secretsmanager",
    "ecr.api",
    "ecr.dkr",
    "logs",
  ]) : toset([])

  vpc_id              = aws_vpc.dedicated[0].id
  service_name        = "com.amazonaws.${var.aws_region}.${each.key}"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.dedicated_private[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints[0].id]
  private_dns_enabled = true

  tags = merge(local.common_tags, {
    Name = "${var.cluster_name}-vpce-${replace(each.key, ".", "-")}"
  })
}

resource "aws_vpc_endpoint" "s3" {
  count = var.networking_mode == "dedicated" ? 1 : 0

  vpc_id            = aws_vpc.dedicated[0].id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids = [
    aws_route_table.dedicated_public[0].id,
    aws_route_table.dedicated_private[0].id,
  ]

  tags = merge(local.common_tags, {
    Name = "${var.cluster_name}-vpce-s3"
  })
}
