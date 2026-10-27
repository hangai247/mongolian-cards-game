#!/usr/bin/env bash
# Post-deploy smoke tests from the Mac. Exit code is non-zero if any automated check fails.
set -uo pipefail
GAME=${GAME:-https://8gar.textbook.mn}
LK=${LK:-https://livekit.textbook.mn}
IP=${IP:-52.76.113.170}
fail=0
check() { if "$@"; then echo "  ok"; else echo "  FAIL"; fail=1; fi; }

echo "== game /healthz"
check curl -fsS --max-time 10 "$GAME/healthz"; echo
echo "== livekit root (expects OK)"
check curl -fsS --max-time 10 "$LK/"; echo
echo "== security headers"
check sh -c "curl -sI --max-time 10 '$GAME/' | grep -qi strict-transport-security"
echo "== socket.io websocket upgrade (HTTP/1.1 forced: Caddy 2.6 has no websocket-over-h2)"
check sh -c "curl --http1.1 -sS -i -N --max-time 5 -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: $(openssl rand -base64 16)' \
  '$GAME/socket.io/?EIO=4&transport=websocket' 2>/dev/null | head -1 | grep -q ' 101 '"
echo "== LiveKit ICE/TCP 7881 reachable"
check nc -vz -w 3 "$IP" 7881
echo "== existing textbook.mn sites unaffected"
for h in studio.textbook.mn embed.textbook.mn; do
  printf '  %-22s ' "$h"; code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "https://$h/" || echo 000)
  echo "$code"; [ "$code" != "000" ] || fail=1
done

cat <<'MANUAL'

== manual checks
1. UDP media path: on the host  `sudo tcpdump -ni any udp port 7882 -c 3`
   on the Mac                   `echo ping | nc -u -w1 52.76.113.170 7882`   (tcpdump must print the packet)
2. LiveKit token + signaling:
   ssh textbook-crawle 'cd /home/ubuntu/eight-gar && docker compose exec -T game node -e "
     const {AccessToken}=require(\"livekit-server-sdk\");
     const t=new AccessToken(process.env.LIVEKIT_API_KEY,process.env.LIVEKIT_API_SECRET,{identity:\"smoke\",ttl:\"10m\"});
     t.addGrant({roomJoin:true,room:\"smoke\"}); t.toJwt().then(console.log)"'
   curl -sS "https://livekit.textbook.mn/rtc/validate?access_token=<JWT>"   # expect: success
   Then https://livekit.io/connection-test with wss://livekit.textbook.mn and that token: note UDP/TCP/TURN path.
3. 8-tab end-to-end in Chrome:
   chrome --use-fake-device-for-media-stream --use-fake-ui-for-media-stream https://8gar.textbook.mn
   Create a room, join from 7 more tabs (or fill bots), start, join voice in each tab.
   chrome://webrtc-internals: 1 outbound + 7 inbound audio tracks per tab, candidate pair udp :7882.
   Play one round; set one tab Offline for 30 s and back: seat kept, state restored, voice reconnects.
   Host: `docker stats` stays under the compose caps; `ss -uanp | grep 7882` shows the peers.
4. One join from a Mongolian mobile network and one from office wifi; note candidate type (srflx/relay, udp/tcp).
MANUAL
exit $fail
