import { createFileRoute } from "@tanstack/react-router";
import { handleInboundVoice } from "@/lib/telephony/twilio.server";

export const Route = createFileRoute("/api/twilio/voice")({
  server: {
    handlers: {
      POST: ({ request }) => handleInboundVoice(request),
    },
  },
});
