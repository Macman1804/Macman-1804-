import { createFileRoute } from "@tanstack/react-router";
import { handlePaymentWebhook } from "@/lib/billing/webhook.server";

export const Route = createFileRoute("/api/billing/webhook")({
  server: {
    handlers: {
      POST: ({ request }) => handlePaymentWebhook(request),
    },
  },
});
