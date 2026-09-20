variable "aws_region" {
  default = "us-east-1"
}

variable "instance_type" {
  default = "t4g.micro"
}

variable "key_pair_name" {
  type    = string
  default = null
}

variable "allow_ssh_cidr" {
  type    = string
  default = null
}

variable "domain_name" {
  type = string
}

variable "backend_image" {
  type = string
}

variable "app_env" {
  type      = map(string)
  sensitive = true
}
