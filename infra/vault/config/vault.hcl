ui            = true
disable_mlock = true

# Single-node storage, encrypted by Vault's barrier (AES-256-GCM).
storage "file" {
  path = "/vault/file"
}

# Plain HTTP only inside the Docker network; Caddy terminates HTTPS and is
# the only container published to the internet.
listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = 1
}
