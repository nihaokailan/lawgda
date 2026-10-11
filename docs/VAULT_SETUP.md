# Lawgda Key Management Server — HashiCorp Vault on Google Cloud

This guide sets up Lawgda's Key Management Server (KMS): **HashiCorp Vault
Community Edition**, running from the **pre-built Docker image** on an
**Ubuntu virtual machine** in Google Cloud. Vault holds the AES-256 Key
Encryption Key (`lawgda-kek`) that wraps every user signing key. The key never
leaves Vault; Lawgda only asks Vault to wrap (encrypt) and unwrap (decrypt).

Time needed: about 1½–2 hours. Region: **asia-southeast1 (Singapore)**.
Cost: about $11/month (e2-micro + 10 GB disk + static IP), paid entirely from the
$300 / 90-day free-trial credit, so nothing is charged to your card. Delete the VM
after the defense (Part 11) and before the trial ends.

```
Lawgda (Vercel) ──HTTPS──▶ Caddy ──▶ Vault (Transit: lawgda-kek)   ← Google Cloud VM (Ubuntu + Docker)
       │
       └──▶ Supabase: stores only Vault ciphertext ("vault:v1:…")
```

> **Never paste unseal keys, the root token, or the secret ID into chat, Git, or screenshots.**

---

## Part 1 — Google Cloud account (15 min)

1. Go to **https://console.cloud.google.com** and sign in with a Google account.
2. Click **Activate / Start free** (the $300 trial). Country: Philippines. Add your card — it is only for verification; the trial does not charge you unless you upgrade. **Write down the trial end date** (shown on the Billing page). It must be after the defense.
3. **Create a project:** top bar → project picker → **New Project** → name `lawgda-kms` → **Create**, then select it.
4. **Budget alert (safety net):** ☰ menu → **Billing** → **Budgets & alerts** → **Create budget** → amount **$1** → leave **"Include credits in cost"** ticked (the default) so the alert only fires if real money would be charged → keep the 50% / 90% / 100% email alerts → **Finish**.

## Part 2 — Create the virtual machine (15 min)

5. **Reserve a fixed public IP address:** ☰ → **VPC network** → **IP addresses** → click **Reserve external static IP address** (not *internal*: Vercel reaches the VM over the public internet, and an internal IP only works inside Google's private network)
   - Name: `vault-ip` · Network Service Tier: **Premium** (default) · IP version: **IPv4** · Type: **Regional** · Region: **asia-southeast1 (Singapore)** · Attached to: **None** (you attach it while creating the VM) → **Reserve**
   - Write the IP down, e.g. `34.82.10.5`. Your Vault hostname is that IP **with dashes** plus `.sslip.io`: `34-82-10-5.sslip.io`

6. ☰ → **Compute Engine** → **VM instances** (click **Enable** if asked for the Compute Engine API) → **Create instance**

   | Setting | Value |
   |---|---|
   | Name | `vault-kms` |
   | Region / Zone | **asia-southeast1 (Singapore)** / `asia-southeast1-a` (must be the same region as `vault-ip`, or the IP won't appear in step 6's dropdown) |
   | Machine | Series **E2** → type **e2-micro** (no "Free tier" note appears outside the US — that's expected; the trial credit covers it) |
   | OS and storage → **Change** | Operating system **Ubuntu** · Version **Ubuntu 24.04 LTS (x86/64, amd64)** · Boot disk type **Standard persistent disk** · Size **10 GB** → **Select** |
   | Networking → Firewall | ✅ **Allow HTTP traffic** ✅ **Allow HTTPS traffic** |
   | Networking → Network interfaces → `default` | **External IPv4 address → `vault-ip`** → Done |

   > The monthly estimate on the right should be roughly **$8–11**. If it is much higher, check that the machine is **e2-micro** and the disk is **Standard persistent disk, 10 GB** (not "Balanced").

   Click **Create** and wait for the green check.

7. In the VM list, click **SSH** next to `vault-kms`. A terminal opens in your browser. Every command below is typed there.

## Part 3 — Prepare Ubuntu and install Docker (10 min)

8. Update Ubuntu and add 1 GB of swap (the e2-micro has only 1 GB RAM):

```bash
sudo apt update && sudo apt -y upgrade
sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

9. Install Docker (official install script) and allow your user to run it:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
exit
```

10. Click **SSH** again to reconnect, then check Docker works:

```bash
docker run --rm hello-world
```
    You should see "Hello from Docker!".

## Part 4 — Start Vault (10 min)

11. Create the folder and the four files (the same files are in the repo under `infra/vault/`). Replace `34-82-10-5` with **your** IP with dashes:

```bash
mkdir -p ~/vault/config && cd ~/vault

echo 'VAULT_HOST=34-82-10-5.sslip.io' > .env

cat > docker-compose.yml <<'EOF'
services:
  vault:
    image: hashicorp/vault:1.18.3
    container_name: vault
    command: server
    cap_add: [IPC_LOCK]
    environment:
      VAULT_ADDR: http://127.0.0.1:8200
      VAULT_API_ADDR: https://${VAULT_HOST}
    volumes:
      - ./config:/vault/config
      - vault-file:/vault/file
      - vault-logs:/vault/logs
    restart: unless-stopped
  caddy:
    image: caddy:2.8.4
    container_name: caddy
    ports: ["80:80", "443:443"]
    environment:
      VAULT_HOST: ${VAULT_HOST}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy-data:/data
      - caddy-config:/config
    depends_on: [vault]
    restart: unless-stopped
volumes:
  vault-file: {}
  vault-logs: {}
  caddy-data: {}
  caddy-config: {}
EOF

cat > config/vault.hcl <<'EOF'
ui            = true
disable_mlock = true
storage "file" {
  path = "/vault/file"
}
listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = 1
}
EOF

cat > Caddyfile <<'EOF'
{$VAULT_HOST} {
	reverse_proxy vault:8200
}
EOF
```

12. Start it:

```bash
docker compose up -d
docker compose ps
docker compose logs caddy | grep -i "certificate obtained"
```
    Both containers should be **Up**, and Caddy should report "certificate obtained successfully" (give it up to a minute).

    > If `docker compose up` says the image tag was not found, open https://hub.docker.com/r/hashicorp/vault/tags, pick the newest `1.x.y` tag, and change `image:` to it.

13. On your **Mac**, open `https://34-82-10-5.sslip.io/v1/sys/health` in a browser. Seeing JSON with `"initialized":false, "sealed":true` means Vault is running and reachable over HTTPS.

## Part 5 — Initialise and unseal (the key ceremony) (10 min)

14. Initialise Vault with **3 unseal keys, any 2 of which unlock it** (Shamir's Secret Sharing):

```bash
docker exec -it vault vault operator init -key-shares=3 -key-threshold=2
```
    It prints **Unseal Key 1, 2, 3** and an **Initial Root Token**. This is shown **only once**.
    - Give **one unseal key to each group member**; each keeps theirs in a password manager or on paper.
    - Keep the **root token** offline too (it is the master admin login).

15. Unseal with any two keys (run twice, pasting a different key each time):

```bash
docker exec -it vault vault operator unseal
docker exec -it vault vault operator unseal
```
    The second time it shows `Sealed  false`.

16. Log in as admin (paste the root token when asked):

```bash
docker exec -it vault vault login
```

## Part 6 — Configure the KMS (10 min)

17. Open a shell inside the Vault container and run the setup:

```bash
docker exec -it vault sh
```
    then, inside it:

```sh
# 1. Audit log: every request to Vault is recorded
vault audit enable file file_path=/vault/logs/audit.log

# 2. Transit engine + the AES-256 Key Encryption Key (non-exportable by default)
vault secrets enable transit
vault write -f transit/keys/lawgda-kek type=aes256-gcm96
vault read transit/keys/lawgda-kek          # check: exportable=false, deletion_allowed=false

# 3. Least-privilege policy: Lawgda may only encrypt/decrypt with this key
vault policy write lawgda - <<'EOF'
path "transit/encrypt/lawgda-kek" { capabilities = ["update"] }
path "transit/decrypt/lawgda-kek" { capabilities = ["update"] }
EOF

# 4. Application identity (AppRole) for the Lawgda server
vault auth enable approle
vault write auth/approle/role/lawgda token_policies=lawgda token_ttl=1h token_max_ttl=4h secret_id_ttl=0

# 5. The two credentials Lawgda needs — copy both somewhere safe
vault read -field=role_id auth/approle/role/lawgda/role-id
vault write -f -field=secret_id auth/approle/role/lawgda/secret-id

exit
```

## Part 7 — Connect Lawgda (on your Mac) (10 min)

18. Add to `.env.local` (keep `KEY_WRAPPING_MASTER_KEY` for now — the migration in Part 9 needs it):

```
VAULT_ADDR=https://34-82-10-5.sslip.io
VAULT_ROLE_ID=<role_id from step 17>
VAULT_SECRET_ID=<secret_id from step 17>
```

19. Prove the connection (this writes nothing to the database):

```bash
node --env-file=.env.local scripts/technicalTests.mjs --trials=50
```
    Section **6. Key Management Server (HashiCorp Vault)** should show 100% on all three checks, and the performance table shows the Vault round-trip times.

## Part 8 — Connect the deployed site (Vercel) (5 min)

> Do this **before** signing anything locally or running Part 9. Once a key is wrapped by Vault, any copy of Lawgda without the Vault settings can no longer sign for that user.

20. Make sure the Vault-enabled code (`lib/vault.js`) is on `main` on GitHub — Vercel deploys it automatically. Until the variables below are set, the deployed site keeps using the old local key, so pushing early is safe.
21. Vercel → **lawgda** → **Settings → Environment Variables** → add, as **Secret**, for Production + Preview + Development:
    `VAULT_ADDR`, `VAULT_ROLE_ID`, `VAULT_SECRET_ID` (same values as step 18).
22. **Deployments → ⋯ → Redeploy.**

## Part 9 — Move existing keys into Vault (5 min)

23. Preview, then apply:

```bash
npm run kms:rewrap              # shows how many keys will move
npm run kms:rewrap -- --apply   # moves them
```
24. In Supabase → **Table Editor** → `user_signing_keys` and `external_signer_keys`: every `wrapped_private_key` now starts with **`vault:v1:`**.
25. Remove `KEY_WRAPPING_MASTER_KEY` from Vercel (and redeploy) and from `.env.local`. Every group member's `.env.local` now needs the three `VAULT_*` values instead.

## Part 10 — Demonstrate it (evidence for the paper)

| Test | How | Expected |
|---|---|---|
| Keys are ciphertext at rest | Supabase Table Editor → `user_signing_keys` | Only `vault:v1:…` values |
| Signing works through the KMS | Sign a document with a drawn signature | Signs normally |
| Every key use is audited | On the VM: `docker exec vault tail -n 3 /vault/logs/audit.log` | Entries for `transit/decrypt/lawgda-kek` with the time of the signing |
| No access without credentials | On your Mac: `curl -s -X POST https://34-82-10-5.sslip.io/v1/transit/decrypt/lawgda-kek -d '{"ciphertext":"vault:v1:AAAA"}'` | `permission denied` |
| Wrong credentials rejected | `curl -s -X POST https://34-82-10-5.sslip.io/v1/auth/approle/login -d '{"role_id":"x","secret_id":"y"}'` | `invalid role or secret ID` |
| App cannot export the key | In the VM: `docker exec -it vault sh`, then `export VAULT_TOKEN=$(vault write -field=token auth/approle/login role_id=<role_id> secret_id=<secret_id>)` and `vault read transit/export/encryption-key/lawgda-kek` | `permission denied` |
| KMS down → fail safely | `docker exec -it vault vault operator seal`, then try to sign | "The signing service is temporarily unavailable. Nothing was signed." Unseal again afterwards (step 15) |
| Measured results | `node --env-file=.env.local scripts/technicalTests.mjs --trials=500 --json=results.json` | Section 6 at 100% |
| Screenshots | Browser: `https://34-82-10-5.sslip.io/ui` → sign in with the root token → **Secrets → transit → lawgda-kek** | Shows the key, type `aes256-gcm96`, not exportable |

## Part 11 — Day-to-day

- **After any VM or container restart, Vault is sealed.** Signing pauses (safely) until two members run step 15. Nothing else in Lawgda is affected.
- **Get notified:** create a free monitor at https://uptimerobot.com for `https://34-82-10-5.sslip.io/v1/sys/health` — it returns 200 when unsealed and 503 when sealed.
- **Don't stop the VM** before the defense — the trial credit covers it, and stopping it seals Vault.
- **After the defense (before the trial end date):** ☰ → **Compute Engine** → **VM instances** → `vault-kms` → **Delete**, then ☰ → **VPC network** → **IP addresses** → `vault-ip` → **Release static address**. A reserved IP left behind keeps costing credit. Signing in the deployed app stops working once Vault is gone.
- **Updating Vault:** change the `image:` tag, then `docker compose pull && docker compose up -d`, then unseal.
- **Key rotation (optional demo):** `vault write -f transit/keys/lawgda-kek/rotate` — new wraps use v2; old `vault:v1:` values still unwrap.
- If Caddy cannot get a certificate for `sslip.io` (rare rate limit), get a free hostname at https://www.duckdns.org pointing to your IP and put it in `.env` as `VAULT_HOST`, then `docker compose up -d`.

## Production vs. this demo

| | This capstone setup | Production |
|---|---|---|
| Unsealing | Manual, 2 of 3 Shamir keys | Auto-unseal with a cloud KMS/HSM |
| Storage | Single node, file | Raft cluster (3+ nodes) |
| Key protection | Software (Vault's AES-256-GCM barrier) | Hardware Security Module |
| Location | Single VM in Singapore (asia-southeast1) | Multi-zone in-region deployment with data-residency review |
| App login | AppRole secret in Vercel env | Workload identity, short-lived secret IDs |
