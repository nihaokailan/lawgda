# Policy for the Lawgda application (AppRole "lawgda").
# Lawgda may only wrap (encrypt) and unwrap (decrypt) with the KEK.
# It cannot read, export, rotate or delete the key, or touch anything else.
path "transit/encrypt/lawgda-kek" {
  capabilities = ["update"]
}

path "transit/decrypt/lawgda-kek" {
  capabilities = ["update"]
}
