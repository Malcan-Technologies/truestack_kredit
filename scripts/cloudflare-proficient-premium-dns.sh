#!/usr/bin/env bash
# Upsert Cloudflare DNS for Proficient Premium (ppsb-eloan.com.my).
#   export CF_API_TOKEN='...'
#   bash scripts/cloudflare-proficient-premium-dns.sh
set -euo pipefail

CF_ZONE_ID="${CF_ZONE_ID:-62138fed804dca28c8646da970d1378c}"
ZONE_NAME="${ZONE_NAME:-ppsb-eloan.com.my}"
ALB="${ALB:-truekredit-proficient-premium-al-56081968.ap-southeast-5.elb.amazonaws.com}"
TUNNEL="${TUNNEL:-67d6a18c-c62d-47af-a0d8-41544b11fb8d.cfargotunnel.com}"

if [[ -z "${CF_API_TOKEN:-}" ]]; then
  echo "Set CF_API_TOKEN first." >&2
  exit 1
fi

api() {
  curl -sS --http1.1 -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json" "$@"
}

# $1 = fqdn  $2 = type  $3 = content  $4 = proxied true|false
upsert_row() {
  local fqdn="$1" type="$2" content="$3" proxied="$4"
  local enc out id payload success
  enc=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$fqdn")
  out=$(api "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records?type=${type}&name=${enc}&per_page=1")
  success=$(echo "$out" | jq -r '.success')
  if [[ "$success" != "true" ]]; then
    echo "$out" | jq . >&2
    return 1
  fi
  id=$(echo "$out" | jq -r '.result[0].id // empty')
  payload=$(jq -nc \
    --arg type "$type" --arg name "$fqdn" --arg content "$content" --arg ps "$proxied" \
    '{type:$type,name:$name,content:$content,ttl:1,proxied:(if $ps == "true" then true else false end)}')
  if [[ -n "$id" && "$id" != "null" ]]; then
    echo "PATCH $type $fqdn"
    api -X PATCH "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records/${id}" -d "$payload" | jq -e '.success == true' >/dev/null
  else
    echo "POST $type $fqdn"
    resp=$(api -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records" -d "$payload")
    echo "$resp" | jq -e '.success == true' >/dev/null || { echo "$resp" | jq . >&2; return 1; }
  fi
}

# Apex cannot have both A and CNAME: remove A at zone apex before CNAME to ALB.
ensure_apex_cname_to_alb() {
  local enc out id
  enc=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$ZONE_NAME")
  out=$(api "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records?type=A&name=${enc}&per_page=1")
  id=$(echo "$out" | jq -r '.result[0].id // empty')
  if [[ -n "$id" && "$id" != "null" ]]; then
    echo "DELETE A ${ZONE_NAME} (replace with CNAME → ALB)"
    api -X DELETE "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records/${id}" | jq -e '.success == true' >/dev/null
  fi
  upsert_row "$ZONE_NAME" CNAME "$ALB" true
}

echo "Checking DNS API access..."
chk=$(api "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records?per_page=1")
if ! echo "$chk" | jq -e '.success == true' >/dev/null; then
  echo "DNS API error (token needs Zone DNS Read+Edit on ${ZONE_NAME}):" >&2
  echo "$chk" | jq . >&2
  exit 1
fi

# ACM (DNS-only, proxied false)
upsert_row "_8bcf4a35d45dded31b91f8286297efc9.admin.${ZONE_NAME}" CNAME "_cb049dde2553a25e5f3115b60e90e29c.jkddzztszm.acm-validations.aws" false
upsert_row "_334099b231f9d15efe9bcfada3795f29.api.${ZONE_NAME}" CNAME "_62b42eb200c390816d37cd46c8930498.jkddzztszm.acm-validations.aws" false
upsert_row "_f183e91324c7bf573e6998ad7124f88e.${ZONE_NAME}" CNAME "_7aee0dc59e3b2444b006434b057568aa.jkddzztszm.acm-validations.aws" false

# Apps → ALB (proxied)
upsert_row "admin.${ZONE_NAME}" CNAME "$ALB" true
upsert_row "api.${ZONE_NAME}" CNAME "$ALB" true
ensure_apex_cname_to_alb
# www and * must not use legacy A records (e.g. old host IPs); use same ALB as borrower apex.
upsert_row "www.${ZONE_NAME}" CNAME "$ALB" true
upsert_row "*.${ZONE_NAME}" CNAME "$ALB" true

# Tunnel (proxied)
upsert_row "sign.${ZONE_NAME}" CNAME "$TUNNEL" true
upsert_row "ssh-sign.${ZONE_NAME}" CNAME "$TUNNEL" true

echo "Done."
