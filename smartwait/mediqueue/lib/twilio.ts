import Twilio from "twilio";

type TwilioClient = ReturnType<typeof Twilio>;

let client: TwilioClient | null = null;

function getClient(): TwilioClient | null {
	const sid = process.env.TWILIO_ACCOUNT_SID;
	const token = process.env.TWILIO_AUTH_TOKEN;
	if (!sid || !token) return null;
	if (client) return client;
	client = Twilio(sid, token);
	return client;
}

export async function sendSms(to: string, body: string): Promise<{ sid?: string }> {
	const from = process.env.TWILIO_PHONE_NUMBER;
	const twilio = getClient();
	if (!twilio || !from) {
		// No-op in local/dev if not configured
		console.log("[SMS simulated]", { to, body });
		return {};
	}
	const msg = await twilio.messages.create({ to, from, body });
	return { sid: msg.sid };
}


