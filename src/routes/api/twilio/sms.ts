import { createFileRoute } from "@tanstack/react-router";
import { handleInboundSms } from "@/lib/telephony/twilio.server";

export const Route = createFileRoute("/api/twilio/sms")({
  server: {
    handlers: {
      POST: ({ request }) => handleInboundSms(request),
    },
  },
});
