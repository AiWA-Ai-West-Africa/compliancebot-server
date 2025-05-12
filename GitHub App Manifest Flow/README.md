# 🚀 GitHub App Manifest for AiWA ComplianceBot

This guide includes the full `manifest.json` and a script to create your GitHub App for **AiWA ComplianceBot** using [GitHub’s Manifest Flow API](https://github.com/settings/apps/new?manifest=true).

---

## 🧾 manifest.json

Save this file as `manifest.json`:

```json
{
  "name": "AiWA ComplianceBot",
  "url": "https://aiwestafrica.com/compliancebot",
  "hook_attributes": {
    "url": "https://aiwestafrica.com/github/webhook"
  },
  "redirect_url": "https://aiwestafrica.com/github/callback",
  "description": "Ensures compliance with AiWA's coding, commit, and branch policies.",
  "public": false,
  "default_permissions": {
    "contents": "write",
    "metadata": "read",
    "issues": "write",
    "pull_requests": "write"
  },
  "default_events": [
    "pull_request",
    "push",
    "repository",
    "installation",
    "installation_repositories"
  ]
}
```

---

## ⚙️ Script to Create the GitHub App

This script uses `curl`. Replace `MANIFEST_CODE` with the code GitHub gives you after starting the "Create from Manifest" flow.

```bash
curl -X POST https://api.github.com/app-manifests/MANIFEST_CODE/conversions \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" \
  --data-binary @manifest.json
```

---

## ✅ How to Get `MANIFEST_CODE`

1. Go to [Create a GitHub App from Manifest](https://github.com/settings/apps/new?manifest=true)
2. Paste your `manifest.json` content into the prompt.
3. GitHub will redirect you with a URL like: `?code=MANIFEST_CODE`
4. Plug that code into the `curl` script above.

---

## 🎯 GitHub Will Respond With:

- `app_id`
- `client_id`
- `client_secret`
- `pem` (private key)

Use these in your `.env` or server configuration to finalize the app integration.

---




