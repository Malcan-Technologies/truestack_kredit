data "aws_vpc" "shared" {
  count = var.networking_mode == "shared" ? 1 : 0

  filter {
    name   = "tag:Name"
    values = [var.shared_vpc_name]
  }
}

data "aws_subnets" "private" {
  count = var.networking_mode == "shared" ? 1 : 0

  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.shared[0].id]
  }

  filter {
    name   = "tag:Type"
    values = ["private"]
  }
}

data "aws_lb" "shared" {
  count = var.networking_mode == "shared" ? 1 : 0
  name  = var.shared_alb_name
}

data "aws_lb_listener" "http" {
  count             = var.networking_mode == "shared" ? 1 : 0
  load_balancer_arn = data.aws_lb.shared[0].arn
  port              = 80
}

data "aws_lb_listener" "https" {
  count             = var.networking_mode == "shared" ? 1 : 0
  load_balancer_arn = data.aws_lb.shared[0].arn
  port              = 443
}

data "aws_route53_zone" "main" {
  count        = var.create_dns_records ? 1 : 0
  name         = var.route53_zone_name
  private_zone = false
}

locals {
  common_tags = {
    Project     = "TrueKredit"
    Environment = var.environment
    ManagedBy   = "Terraform"
    Product     = "TrueKreditPro"
  }

  backend_repository_url  = aws_ecr_repository.backend.repository_url
  admin_repository_url    = aws_ecr_repository.admin.repository_url
  borrower_repository_url = aws_ecr_repository.borrower.repository_url
}

resource "aws_ecr_repository" "backend" {
  name                 = var.backend_repository_name
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = false
  }

  tags = merge(local.common_tags, {
    Name = var.backend_repository_name
  })
}

resource "aws_ecr_repository" "admin" {
  name                 = var.admin_repository_name
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = false
  }

  tags = merge(local.common_tags, {
    Name = var.admin_repository_name
  })
}

resource "aws_ecr_repository" "borrower" {
  name                 = var.borrower_repository_name
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = false
  }

  tags = merge(local.common_tags, {
    Name = var.borrower_repository_name
  })
}

resource "aws_ecr_repository" "signing_gateway" {
  count = var.signing_gateway_repository_name != "" ? 1 : 0

  name                 = var.signing_gateway_repository_name
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = false
  }

  tags = merge(local.common_tags, {
    Name = var.signing_gateway_repository_name
  })
}

resource "aws_s3_bucket" "uploads" {
  bucket = var.uploads_bucket_name

  tags = merge(local.common_tags, {
    Name = var.uploads_bucket_name
  })
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  versioning_configuration {
    status = "Disabled"
  }
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${var.backend_service_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "admin" {
  name              = "/ecs/${var.admin_service_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "borrower" {
  name              = "/ecs/${var.borrower_service_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_ecs_cluster" "main" {
  name = var.cluster_name

  setting {
    name  = "containerInsights"
    value = "disabled"
  }

  tags = merge(local.common_tags, {
    Name = var.cluster_name
  })
}

resource "aws_iam_role" "ecs_execution" {
  name = "${var.cluster_name}-ecs-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "ecs_task" {
  name = "${var.cluster_name}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_security_group" "ecs" {
  name        = "${var.cluster_name}-ecs-sg"
  description = "ECS tasks for ${var.cluster_name} (ingress from ALB only)"
  vpc_id      = local.vpc_id

  ingress {
    description     = "Backend from ALB"
    from_port       = var.backend_port
    to_port         = var.backend_port
    protocol        = "tcp"
    security_groups = local.alb_ingress_security_group_ids
  }

  ingress {
    description     = "Admin from ALB"
    from_port       = var.admin_port
    to_port         = var.admin_port
    protocol        = "tcp"
    security_groups = local.alb_ingress_security_group_ids
  }

  ingress {
    description     = "Borrower from ALB"
    from_port       = var.borrower_port
    to_port         = var.borrower_port
    protocol        = "tcp"
    security_groups = local.alb_ingress_security_group_ids
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    Name = "${var.cluster_name}-ecs-sg"
  })
}

resource "aws_db_subnet_group" "main" {
  name       = var.cluster_name
  subnet_ids = local.private_subnet_ids

  tags = merge(local.common_tags, {
    Name = var.cluster_name
  })
}

resource "aws_security_group" "rds" {
  name        = "${var.cluster_name}-rds-sg"
  description = "RDS for ${var.cluster_name}"
  vpc_id      = local.vpc_id

  ingress {
    description     = "PostgreSQL from ECS"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  tags = merge(local.common_tags, {
    Name = "${var.cluster_name}-rds-sg"
  })
}

resource "aws_db_instance" "main" {
  identifier = var.cluster_name

  engine         = "postgres"
  engine_version = "16.11"
  instance_class = "db.t4g.micro"

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  port     = 5432

  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  multi_az               = false

  backup_retention_period      = 7
  backup_window                = "03:00-04:00"
  maintenance_window           = "Mon:04:00-Mon:05:00"
  performance_insights_enabled = false

  deletion_protection = false
  skip_final_snapshot = true
  apply_immediately   = true

  lifecycle {
    ignore_changes = [password]
  }

  tags = merge(local.common_tags, {
    Name = var.cluster_name
  })
}

data "aws_secretsmanager_secret_version" "rds_master" {
  secret_id = aws_db_instance.main.master_user_secret[0].secret_arn

  depends_on = [aws_db_instance.main]
}

resource "random_password" "better_auth" {
  length  = 48
  special = false
}

resource "random_password" "jwt" {
  length  = 48
  special = false
}

resource "random_password" "jwt_refresh" {
  length  = 48
  special = false
}

resource "random_password" "webhook" {
  length  = 48
  special = false
}

locals {
  rds_secret   = jsondecode(data.aws_secretsmanager_secret_version.rds_master.secret_string)
  database_url = "postgresql://${var.db_username}:${urlencode(local.rds_secret.password)}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${var.db_name}"
}

resource "aws_secretsmanager_secret" "app" {
  name                    = var.app_secret_name
  recovery_window_in_days = 0

  tags = merge(local.common_tags, {
    Name = var.app_secret_name
  })
}

# Single JSON secret: ECS maps each key via valueFrom = "arn:...:json_key::"
# Fill in empty strings in AWS console (or override via Terraform) for third-party keys.
# Keys here must match the `secrets` blocks on backend/admin/borrower task definitions.
resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    database_url                = local.database_url
    better_auth_secret          = random_password.better_auth.result
    jwt_secret                  = random_password.jwt.result
    jwt_refresh_secret          = random_password.jwt_refresh.result
    webhook_secret              = random_password.webhook.result
    resend_api_key              = ""
    resend_webhook_secret       = ""
    trueidentity_admin_base_url = ""
    kredit_webhook_secret       = ""
    trueidentity_webhook_secret = ""
    kredit_internal_secret      = ""
    # Google Calendar / Meet (attestation) — optional; leave blank if unused
    google_service_account_email       = ""
    google_service_account_private_key = ""
    google_calendar_id                 = ""
    google_calendar_impersonate_user   = ""
    # TrueStack KYC (Bearer + webhook HMAC)
    truestack_kyc_api_key        = ""
    truestack_kyc_webhook_secret = ""
    # On-prem Signing Gateway
    signing_gateway_url     = ""
    signing_api_key         = ""
    signing_enabled         = "false"
    CF_ACCESS_CLIENT_ID     = ""
    CF_ACCESS_CLIENT_SECRET = ""
  })

  # Secret values are managed in AWS Secrets Manager after bootstrap.
  # Keep Terraform from overwriting manual updates on later applies.
  lifecycle {
    ignore_changes = [secret_string]
  }
}

resource "aws_iam_role_policy" "secrets_access" {
  name = "${var.cluster_name}-secrets-access"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [aws_secretsmanager_secret.app.arn]
      }
    ]
  })
}

resource "aws_iam_role_policy" "s3_access" {
  name = "${var.cluster_name}-s3-access"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = ["${aws_s3_bucket.uploads.arn}/*"]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = [aws_s3_bucket.uploads.arn]
      }
    ]
  })
}

resource "aws_lb_target_group" "backend" {
  name                 = substr("${var.project_name}-${var.environment}-be-tg", 0, 32)
  port                 = var.backend_port
  protocol             = "HTTP"
  vpc_id               = local.vpc_id
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

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-be-tg"
  })
}

resource "aws_lb_target_group" "admin" {
  name                 = substr("${var.project_name}-${var.environment}-adm-tg", 0, 32)
  port                 = var.admin_port
  protocol             = "HTTP"
  vpc_id               = local.vpc_id
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

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-adm-tg"
  })
}

resource "aws_lb_target_group" "borrower" {
  name                 = substr("${var.project_name}-${var.environment}-bor-tg", 0, 32)
  port                 = var.borrower_port
  protocol             = "HTTP"
  vpc_id               = local.vpc_id
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

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-bor-tg"
  })
}

resource "aws_lb_listener_rule" "https_api" {
  listener_arn = local.https_listener_arn
  priority     = var.https_api_priority

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

resource "aws_lb_listener_rule" "https_admin" {
  listener_arn = local.https_listener_arn
  priority     = var.https_admin_priority

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.admin.arn
  }

  condition {
    host_header {
      values = [var.admin_domain]
    }
  }
}

resource "aws_lb_listener_rule" "https_borrower" {
  listener_arn = local.https_listener_arn
  priority     = var.https_borrower_priority

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.borrower.arn
  }

  condition {
    host_header {
      values = [var.borrower_domain]
    }
  }
}

resource "aws_lb_listener_rule" "http_api" {
  listener_arn = local.http_listener_arn
  priority     = var.http_api_priority

  action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }

  condition {
    host_header {
      values = [var.api_domain]
    }
  }
}

resource "aws_lb_listener_rule" "http_admin" {
  listener_arn = local.http_listener_arn
  priority     = var.http_admin_priority

  action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }

  condition {
    host_header {
      values = [var.admin_domain]
    }
  }
}

resource "aws_lb_listener_rule" "http_borrower" {
  listener_arn = local.http_listener_arn
  priority     = var.http_borrower_priority

  action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }

  condition {
    host_header {
      values = [var.borrower_domain]
    }
  }
}

resource "aws_ecs_task_definition" "backend" {
  family                   = var.backend_service_name
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name  = "backend"
      image = "${local.backend_repository_url}:latest"
      portMappings = [
        {
          containerPort = var.backend_port
          hostPort      = var.backend_port
          protocol      = "tcp"
        }
      ]
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = tostring(var.backend_port) },
        { name = "FRONTEND_URL", value = "https://${var.admin_domain}" },
        { name = "BETTER_AUTH_BASE_URL", value = "https://${var.admin_domain}" },
        { name = "BETTER_AUTH_TRUSTED_ORIGINS", value = "https://${var.admin_domain},https://${var.borrower_domain}" },
        { name = "CORS_ORIGINS", value = "https://${var.admin_domain},https://${var.borrower_domain}" },
        { name = "PRODUCT_MODE", value = "pro" },
        { name = "PRO_TENANT_SLUG", value = var.pro_tenant_slug },
        { name = "STORAGE_TYPE", value = "s3" },
        { name = "S3_BUCKET", value = aws_s3_bucket.uploads.id },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "UPLOAD_DIR", value = "/tmp/uploads" },
        { name = "TRUESTACK_KYC_API_BASE_URL", value = var.truestack_kyc_api_base_url },
        { name = "TRUESTACK_KYC_PUBLIC_WEBHOOK_BASE_URL", value = "https://${var.api_domain}" },
        { name = "TRUESTACK_KYC_REDIRECT_URL", value = "" },
        { name = "EMAIL_FROM_NAME", value = var.email_from_name },
        { name = "EMAIL_FROM_ADDRESS", value = var.email_from_address }
      ]
      secrets = [
        { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.app.arn}:database_url::" },
        { name = "BETTER_AUTH_SECRET", valueFrom = "${aws_secretsmanager_secret.app.arn}:better_auth_secret::" },
        { name = "JWT_SECRET", valueFrom = "${aws_secretsmanager_secret.app.arn}:jwt_secret::" },
        { name = "JWT_REFRESH_SECRET", valueFrom = "${aws_secretsmanager_secret.app.arn}:jwt_refresh_secret::" },
        { name = "WEBHOOK_SECRET", valueFrom = "${aws_secretsmanager_secret.app.arn}:webhook_secret::" },
        { name = "RESEND_API_KEY", valueFrom = "${aws_secretsmanager_secret.app.arn}:resend_api_key::" },
        { name = "RESEND_WEBHOOK_SECRET", valueFrom = "${aws_secretsmanager_secret.app.arn}:resend_webhook_secret::" },
        { name = "TRUEIDENTITY_ADMIN_BASE_URL", valueFrom = "${aws_secretsmanager_secret.app.arn}:trueidentity_admin_base_url::" },
        { name = "KREDIT_WEBHOOK_SECRET", valueFrom = "${aws_secretsmanager_secret.app.arn}:kredit_webhook_secret::" },
        { name = "TRUEIDENTITY_WEBHOOK_SECRET", valueFrom = "${aws_secretsmanager_secret.app.arn}:trueidentity_webhook_secret::" },
        { name = "KREDIT_INTERNAL_SECRET", valueFrom = "${aws_secretsmanager_secret.app.arn}:kredit_internal_secret::" },
        { name = "GOOGLE_SERVICE_ACCOUNT_EMAIL", valueFrom = "${aws_secretsmanager_secret.app.arn}:google_service_account_email::" },
        { name = "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", valueFrom = "${aws_secretsmanager_secret.app.arn}:google_service_account_private_key::" },
        { name = "GOOGLE_CALENDAR_ID", valueFrom = "${aws_secretsmanager_secret.app.arn}:google_calendar_id::" },
        { name = "GOOGLE_CALENDAR_IMPERSONATE_USER", valueFrom = "${aws_secretsmanager_secret.app.arn}:google_calendar_impersonate_user::" },
        { name = "TRUESTACK_KYC_API_KEY", valueFrom = "${aws_secretsmanager_secret.app.arn}:truestack_kyc_api_key::" },
        { name = "TRUESTACK_KYC_WEBHOOK_SECRET", valueFrom = "${aws_secretsmanager_secret.app.arn}:truestack_kyc_webhook_secret::" },
        { name = "SIGNING_GATEWAY_URL", valueFrom = "${aws_secretsmanager_secret.app.arn}:signing_gateway_url::" },
        { name = "SIGNING_API_KEY", valueFrom = "${aws_secretsmanager_secret.app.arn}:signing_api_key::" },
        { name = "SIGNING_ENABLED", valueFrom = "${aws_secretsmanager_secret.app.arn}:signing_enabled::" },
        { name = "CF_ACCESS_CLIENT_ID", valueFrom = "${aws_secretsmanager_secret.app.arn}:CF_ACCESS_CLIENT_ID::" },
        { name = "CF_ACCESS_CLIENT_SECRET", valueFrom = "${aws_secretsmanager_secret.app.arn}:CF_ACCESS_CLIENT_SECRET::" }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.backend.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])
}

resource "aws_ecs_task_definition" "admin" {
  family                   = var.admin_service_name
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name  = "admin"
      image = "${local.admin_repository_url}:latest"
      portMappings = [
        {
          containerPort = var.admin_port
          hostPort      = var.admin_port
          protocol      = "tcp"
        }
      ]
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = tostring(var.admin_port) },
        { name = "BACKEND_URL", value = "https://${var.api_domain}" },
        { name = "NEXT_PUBLIC_API_URL", value = "https://${var.api_domain}" },
        { name = "NEXT_PUBLIC_APP_URL", value = "https://${var.admin_domain}" },
        { name = "NEXT_PUBLIC_PRODUCT_MODE", value = "pro" },
        { name = "S3_BUCKET", value = aws_s3_bucket.uploads.id },
        { name = "AWS_REGION", value = var.aws_region }
      ]
      secrets = [
        { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.app.arn}:database_url::" },
        { name = "BETTER_AUTH_SECRET", valueFrom = "${aws_secretsmanager_secret.app.arn}:better_auth_secret::" },
        { name = "RESEND_API_KEY", valueFrom = "${aws_secretsmanager_secret.app.arn}:resend_api_key::" }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.admin.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])

  lifecycle {
    ignore_changes = [container_definitions]
  }
}

resource "aws_ecs_task_definition" "borrower" {
  family                   = var.borrower_service_name
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name  = "borrower"
      image = "${local.borrower_repository_url}:latest"
      portMappings = [
        {
          containerPort = var.borrower_port
          hostPort      = var.borrower_port
          protocol      = "tcp"
        }
      ]
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = tostring(var.borrower_port) },
        { name = "BACKEND_URL", value = "https://${var.api_domain}" },
        { name = "NEXT_PUBLIC_BACKEND_URL", value = "https://${var.api_domain}" },
        { name = "NEXT_PUBLIC_APP_URL", value = "https://${var.borrower_domain}" },
        { name = "EMAIL_FROM_NAME", value = var.email_from_name },
        { name = "EMAIL_FROM_ADDRESS", value = var.email_from_address }
      ]
      secrets = [
        { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.app.arn}:database_url::" },
        { name = "BETTER_AUTH_SECRET", valueFrom = "${aws_secretsmanager_secret.app.arn}:better_auth_secret::" },
        { name = "RESEND_API_KEY", valueFrom = "${aws_secretsmanager_secret.app.arn}:resend_api_key::" }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.borrower.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])

  lifecycle {
    ignore_changes = [container_definitions]
  }
}

resource "aws_ecs_task_definition" "migrations" {
  family                   = var.migrations_task_name
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "migrations"
      image     = "${local.backend_repository_url}:latest-migrations"
      essential = true
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PRO_TENANT_SLUG", value = var.pro_tenant_slug }
      ]
      secrets = [
        { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.app.arn}:database_url::" }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.backend.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "migrations"
        }
      }
    }
  ])

  lifecycle {
    ignore_changes = [container_definitions]
  }
}

resource "aws_ecs_service" "backend" {
  name            = var.backend_service_name
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = var.backend_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = local.ecs_subnet_ids
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = local.ecs_assign_public_ip
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = var.backend_port
  }

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100

  # Track task_definition so env/secrets (e.g. Google Calendar) from Terraform reach running tasks.
  # Keep desired_count ignored if you scale the service outside Terraform.
  lifecycle {
    ignore_changes = [desired_count]
  }
}

resource "aws_ecs_service" "admin" {
  name            = var.admin_service_name
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.admin.arn
  desired_count   = var.admin_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = local.ecs_subnet_ids
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = local.ecs_assign_public_ip
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.admin.arn
    container_name   = "admin"
    container_port   = var.admin_port
  }

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }
}

resource "aws_ecs_service" "borrower" {
  name            = var.borrower_service_name
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.borrower.arn
  desired_count   = var.borrower_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = local.ecs_subnet_ids
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = local.ecs_assign_public_ip
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.borrower.arn
    container_name   = "borrower"
    container_port   = var.borrower_port
  }

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }
}

resource "aws_route53_record" "admin" {
  count   = var.create_dns_records ? 1 : 0
  zone_id = data.aws_route53_zone.main[0].zone_id
  name    = var.admin_domain
  type    = "A"

  alias {
    name                   = local.alb_dns_name
    zone_id                = local.alb_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "api" {
  count   = var.create_dns_records ? 1 : 0
  zone_id = data.aws_route53_zone.main[0].zone_id
  name    = var.api_domain
  type    = "A"

  alias {
    name                   = local.alb_dns_name
    zone_id                = local.alb_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "borrower" {
  count   = var.create_dns_records ? 1 : 0
  zone_id = data.aws_route53_zone.main[0].zone_id
  name    = var.borrower_domain
  type    = "A"

  alias {
    name                   = local.alb_dns_name
    zone_id                = local.alb_zone_id
    evaluate_target_health = false
  }
}
