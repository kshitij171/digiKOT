# LAN parity sign-off

Run **only** production mode — no Vite:

```bash
npm run build
npm run start
```

Open `http://<laptop-lan-ip>:3000` on a real tablet. Test with real ESP8266 pager on LAN.

## Checklist

| # | Flow | Pass | Notes |
|---|------|------|-------|
| 1 | Waiter PIN login on tablet | | |
| 2 | Kitchen PIN login | | |
| 3 | Manager PIN login | | |
| 4 | Logout (no 400 error) | | |
| 5 | Waiter: open table, create KOT, add items | | |
| 6 | Kitchen: mark item done | | |
| 7 | Waiter: notification appears (no manual refresh) | | Socket.IO emit |
| 8 | Pager: MQTT alert on done item | | |
| 9 | Billing: draft bill, clear table | | |
| 10 | Bill modification: waiter request, manager approve | | |
| 11 | Manager: audit feed updates | | |
| 12 | Manager: assign pager to waiter | | |
| 13 | `/setup`: discovery, hello, save Wi-Fi, push, test beep, `mqtt_ok` | | |
| 14 | Server restart — data persists, re-login works | | |
| 15 | WhatsApp Cloud API send (if configured) | | Waiter or manager |
| 16 | `npm run smoke` returns OK | | |

**Signed off by:** _______________ **Date:** _______________

**Git tag at sign-off:** _______________

**Waivers (if any):**
