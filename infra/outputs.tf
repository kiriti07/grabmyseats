output "public_ip"          { value = aws_eip.backend.public_ip }
output "ecr_repository_url" { value = aws_ecr_repository.backend.repository_url }
output "ssm_connect"        { value = "aws ssm start-session --target ${aws_instance.backend.id} --region ${var.aws_region}" }
