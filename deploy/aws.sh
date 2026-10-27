#!/usr/bin/env bash
# AWS-side changes for the eight-gar stack, run from the Mac. Nothing runs without a subcommand.
#   deploy/aws.sh verify   # read-only: identity, instance, security group, CPU credit mode
#   deploy/aws.sh dns      # Route 53 UPSERT A records for 8gar + livekit -> 52.76.113.170
#   deploy/aws.sh sg       # open TCP 7881, UDP 7882, UDP 3478 (LiveKit media); idempotent
set -euo pipefail

export AWS_PROFILE=${AWS_PROFILE:-aplus}
export AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION:-ap-southeast-1}
export AWS_PAGER=""
INSTANCE=${INSTANCE:-i-0395a6d6d18ecd1b4}
IP=${IP:-52.76.113.170}
ZONE_NAME=textbook.mn.
HOSTS=(8gar.textbook.mn livekit.textbook.mn)

usage() { sed -n '2,6p' "$0"; exit 1; }
[ $# -eq 1 ] || usage

sg_id() {
  # First SG on the instance; override with SG=sg-... if the instance has several.
  echo "${SG:-$(aws ec2 describe-instances --instance-ids "$INSTANCE" \
    --query 'Reservations[0].Instances[0].SecurityGroups[0].GroupId' --output text)}"
}

case "$1" in
  verify)
    echo "Plan: sts get-caller-identity; ec2 describe-instances $INSTANCE; describe-security-groups; describe-instance-credit-specifications; route53 list-hosted-zones-by-name"
    echo "== identity (profile $AWS_PROFILE)"; aws sts get-caller-identity --output table
    echo "== instance"; aws ec2 describe-instances --instance-ids "$INSTANCE" \
      --query 'Reservations[0].Instances[0].{Type:InstanceType,Ip:PublicIpAddress,State:State.Name,SGs:SecurityGroups[].GroupId,Name:Tags[?Key==`Name`].Value|[0]}' --output table
    SG=$(sg_id); echo "== security group $SG ingress"
    aws ec2 describe-security-groups --group-ids "$SG" \
      --query 'SecurityGroups[0].IpPermissions[].{Proto:IpProtocol,From:FromPort,To:ToPort,V4:join(`,`,IpRanges[].CidrIp),V6:join(`,`,Ipv6Ranges[].CidrIpv6)}' --output table
    echo "== CPU credit mode (standard drains credits under sustained load; unlimited bills overage)"
    aws ec2 describe-instance-credit-specifications --instance-ids "$INSTANCE" --output table
    echo "== hosted zone"; aws route53 list-hosted-zones-by-name --dns-name "$ZONE_NAME" --max-items 1 \
      --query 'HostedZones[?Name==`'"$ZONE_NAME"'`].{Name:Name,Id:Id}' --output table
    ;;
  dns)
    ZONE=$(aws route53 list-hosted-zones-by-name --dns-name "$ZONE_NAME" --max-items 1 \
      --query 'HostedZones[?Name==`'"$ZONE_NAME"'`].Id | [0]' --output text)
    [ -n "$ZONE" ] && [ "$ZONE" != "None" ] || { echo "zone $ZONE_NAME not visible with profile $AWS_PROFILE"; exit 1; }
    echo "Plan: UPSERT A ${HOSTS[*]} -> $IP (TTL 300) in zone $ZONE, then wait for INSYNC"
    CHANGES=$(printf '{"Action":"UPSERT","ResourceRecordSet":{"Name":"%s.","Type":"A","TTL":300,"ResourceRecords":[{"Value":"%s"}]}},' "${HOSTS[0]}" "$IP" "${HOSTS[1]}" "$IP")
    CHANGE_ID=$(aws route53 change-resource-record-sets --hosted-zone-id "$ZONE" \
      --change-batch "{\"Comment\":\"eight-gar game + livekit\",\"Changes\":[${CHANGES%,}]}" \
      --query 'ChangeInfo.Id' --output text)
    echo "Change $CHANGE_ID submitted; waiting for INSYNC"
    aws route53 wait resource-record-sets-changed --id "$CHANGE_ID"
    for h in "${HOSTS[@]}"; do printf '  %-22s %s\n' "$h" "$(dig +short "$h" @8.8.8.8 | tr '\n' ' ')"; done
    ;;
  sg)
    SG=$(sg_id)
    echo "Plan: authorize ingress on $SG: tcp 7881 (ICE/TCP), udp 7882 (ICE/UDP mux), udp 3478 (TURN/UDP) from 0.0.0.0/0 and ::/0"
    echo "      7880 / 4000 / 5433 stay closed (loopback-published or served only through Caddy)."
    authorize() {  # proto port description; tolerate rules that already exist
      local out
      if out=$(aws ec2 authorize-security-group-ingress --group-id "$SG" --ip-permissions \
        "[{\"IpProtocol\":\"$1\",\"FromPort\":$2,\"ToPort\":$2,\"IpRanges\":[{\"CidrIp\":\"0.0.0.0/0\",\"Description\":\"$3\"}],\"Ipv6Ranges\":[{\"CidrIpv6\":\"::/0\",\"Description\":\"$3\"}]}]" 2>&1); then
        echo "  added $1/$2 ($3)"
      elif grep -q 'InvalidPermission.Duplicate' <<<"$out"; then
        echo "  already present $1/$2 ($3)"
      else
        echo "$out"; exit 1
      fi
    }
    authorize tcp 7881 "livekit ICE/TCP"
    authorize udp 7882 "livekit ICE/UDP mux"
    authorize udp 3478 "livekit TURN/UDP"
    aws ec2 describe-security-groups --group-ids "$SG" \
      --query 'SecurityGroups[0].IpPermissions[?FromPort==`7881`||FromPort==`7882`||FromPort==`3478`].{Proto:IpProtocol,Port:FromPort,V4:join(`,`,IpRanges[].CidrIp)}' --output table
    ;;
  *) usage ;;
esac
