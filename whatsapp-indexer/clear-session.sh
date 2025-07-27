#!/bin/bash
echo "🧹 Clearing WhatsApp session..."
rm -rf .wwebjs_auth/
rm -rf .wwebjs_cache/
echo "✅ Session cleared. Next run will require QR scan, but should persist after that."
