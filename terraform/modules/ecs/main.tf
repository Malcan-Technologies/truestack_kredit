variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "alb_security_group_id" {
  type = string
}

variable "backend_target_group_arn" {
  type = string
}

variable "frontend_target_group_arn" {
  type = string
}

variable "backend_ecr_repository_url" {
  type = string
}

variable "frontend_ecr_repository_url" {
  type = string
}

variable "image_tag" {
  type    = string
  default = "latest"
}

variable "backend_desired_count" {
  type    = number
  default = 1
}

variable "frontend_desired_count" {
  type    = number
  default = 1
}

variable "frontend_url" {
  type = string
}

variable "api_url" {
  type = string
}

variable "s3_bucket" {
  type = string
}

variable "secrets_arn" {
  type = string
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${var.project_name}-${var.environment}-backend"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_group" "frontend" {
  name              = "/ecs/${var.project_name}-${var.environment}-frontend"
  retention_in_days = 14
}

resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-${var.environment}"

  setting {
    name  = "containerInsights"
    value = "disabled"
  }
}

resource "aws_iam_role" "ecs_execution" {
  name = "${var.project_name}-${var.environment}-ecs-execution"

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

resource "aws_iam_role_policy" "secrets_access" {
  name = "secrets-access"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [var.secrets_arn]
      }
    ]
  })
}

resource "aws_iam_role" "ecs_task" {
  name = "${var.project_name}-${var.environment}-ecs-task"

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

resource "aws_iam_role_policy" "s3_access" {
  name = "s3-access"
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
        Resource = ["arn:aws:s3:::${var.s3_bucket}/*"]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = ["arn:aws:s3:::${var.s3_bucket}"]
      }
    ]
  })
}

resource "aws_security_group" "ecs" {
  name        = "${var.project_name}-${var.environment}-ecs-sg"
  description = "Security group for ECS tasks"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Backend HTTP from ALB"
    from_port       = 4000
    to_port         = 4000
    protocol        = "tcp"
    security_groups = [var.alb_security_group_id]
  }

  ingress {
    description     = "Frontend HTTP from ALB"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [var.alb_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-${var.environment}-ecs-sg"
  }
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "${var.project_name}-${var.environment}-backend"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name  = "backend"
      image = "${var.backend_ecr_repository_url}:${var.image_tag}"

      portMappings = [
        {
          containerPort = 4000
          hostPort      = 4000
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = "4000" },
        { name = "FRONTEND_URL", value = var.frontend_url },
        { name = "CORS_ORIGINS", value = var.frontend_url },
        { name = "STORAGE_TYPE", value = "s3" },
        { name = "S3_BUCKET", value = var.s3_bucket },
        { name = "AWS_REGION", value = var.aws_region },
      ]

      secrets = [
        { name = "DATABASE_URL", valueFrom = "${var.secrets_arn}:database_url::" },
        { name = "BETTER_AUTH_SECRET", valueFrom = "${var.secrets_arn}:better_auth_secret::" },
        { name = "JWT_SECRET", valueFrom = "${var.secrets_arn}:jwt_secret::" },
        { name = "JWT_REFRESH_SECRET", valueFrom = "${var.secrets_arn}:jwt_refresh_secret::" },
        { name = "WEBHOOK_SECRET", valueFrom = "${var.secrets_arn}:webhook_secret::" },
        { name = "RESEND_API_KEY", valueFrom = "${var.secrets_arn}:resend_api_key::" },
        { name = "RESEND_WEBHOOK_SECRET", valueFrom = "${var.secrets_arn}:resend_webhook_secret::" },
        # TrueIdentity / TrueStack Admin (keys match AWS secret JSON)
        { name = "trueidentity_admin_base_url", valueFrom = "${var.secrets_arn}:trueidentity_admin_base_url::" },
        { name = "kredit_webhook_secret", valueFrom = "${var.secrets_arn}:kredit_webhook_secret::" },
        { name = "trueidentity_webhook_secret", valueFrom = "${var.secrets_arn}:trueidentity_webhook_secret::" },
        { name = "kredit_internal_secret", valueFrom = "${var.secrets_arn}:kredit_internal_secret::" },
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

resource "aws_ecs_service" "backend" {
  name            = "${var.project_name}-${var.environment}-backend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = var.backend_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.backend_target_group_arn
    container_name   = "backend"
    container_port   = 4000
  }

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100

  depends_on = [aws_iam_role_policy.s3_access]
}

resource "aws_ecs_task_definition" "frontend" {
  family                   = "${var.project_name}-${var.environment}-frontend"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name  = "frontend"
      image = "${var.frontend_ecr_repository_url}:${var.image_tag}"

      portMappings = [
        {
          containerPort = 3000
          hostPort      = 3000
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = "3000" },
        { name = "NEXT_PUBLIC_API_URL", value = var.api_url },
        { name = "NEXT_PUBLIC_APP_URL", value = var.frontend_url },
        { name = "BACKEND_URL", value = var.api_url },
        { name = "S3_BUCKET", value = var.s3_bucket },
        { name = "AWS_REGION", value = var.aws_region },
      ]

      secrets = [
        { name = "BETTER_AUTH_SECRET", valueFrom = "${var.secrets_arn}:better_auth_secret::" },
        # Required for password reset: Prisma (Better Auth) + Resend
        { name = "DATABASE_URL", valueFrom = "${var.secrets_arn}:database_url::" },
        { name = "RESEND_API_KEY", valueFrom = "${var.secrets_arn}:resend_api_key::" },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.frontend.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "frontend" {
  name            = "${var.project_name}-${var.environment}-frontend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.frontend.arn
  desired_count   = var.frontend_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.frontend_target_group_arn
    container_name   = "frontend"
    container_port   = 3000
  }

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100
}

resource "aws_ecs_task_definition" "migrations" {
  family                   = "${var.project_name}-${var.environment}-migrations"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "migrations"
      image     = "${var.backend_ecr_repository_url}:${var.image_tag}-migrations"
      essential = true

      environment = [
        { name = "NODE_ENV", value = "production" },
      ]

      secrets = [
        { name = "DATABASE_URL", valueFrom = "${var.secrets_arn}:database_url::" },
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
}

output "cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "cluster_arn" {
  value = aws_ecs_cluster.main.arn
}

output "backend_service_name" {
  value = aws_ecs_service.backend.name
}

output "frontend_service_name" {
  value = aws_ecs_service.frontend.name
}

output "security_group_id" {
  value = aws_security_group.ecs.id
}

output "migration_task_definition_arn" {
  value = aws_ecs_task_definition.migrations.arn
}

output "private_subnet_ids" {
  value = var.private_subnet_ids
}
